import { randomBytes } from "node:crypto";
import { Router, type Request } from "express";
import multer from "multer";
import { z } from "zod";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { config } from "../config";
import { query, transaction } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { emitToUsers } from "../realtime";
import { recordScope, telegramAccessSql } from "../scope";
import { objectStorage } from "../storage";
import { bot, telegramConfigured, TelegramApiError } from "../telegram/botApi";
import { contactAudience, hashToken, notifyContact, type ContactRow } from "../telegram/handleUpdate";
import { applyImport, previewImport } from "../telegram/importContacts";
import { botCompanyId, checkConnection } from "../telegram/runner";
import type { AuthContext } from "../types";
import { createClient } from "./clients";
import { createDeal, dealScope } from "./deals";

const idSchema = z.string().uuid();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: Math.min(config.maxUploadBytes, 50 * 1024 * 1024), files: 1 } });
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
export const INVITE_DAYS = 30;

export const telegramRouter = Router();

async function deny(req: Request, auth: AuthContext, action: string, entityId: string | null, message: string): Promise<never> {
  await writeAudit(req, { auth, action: `${action}_DENIED`, entityType: "telegram_contact", entityId });
  throw new ApiError(403, "TELEGRAM_FORBIDDEN", message);
}

function assertConfigured(): void {
  if (!telegramConfigured()) throw new ApiError(503, "TELEGRAM_UNCONFIGURED", "The Telegram bot is not configured on the server");
}

/** A contact the caller may see (and answer), or 404. */
async function visibleContact(auth: AuthContext, id: string): Promise<ContactRow> {
  const access = telegramAccessSql(auth, "c", 2);
  const result = await query<ContactRow>(`SELECT c.* FROM telegram_contacts c WHERE c.id = $1 AND ${access.sql}`, [idSchema.parse(id), ...access.values]);
  if (!result.rows[0]) throw new ApiError(404, "TELEGRAM_CONTACT_NOT_FOUND", "Conversation not found");
  return result.rows[0];
}

const contactColumns = (me: number) => `c.id, c.telegram_user_id::text AS "telegramUserId", c.username, c.first_name AS "firstName", c.last_name AS "lastName",
  c.status, c.bound_via AS "boundVia", c.last_message_at AS "lastMessageAt", c.created_at AS "createdAt",
  coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), '@' || c.username, 'Telegram ' || c.telegram_user_id) AS "displayName",
  CASE WHEN cl.id IS NULL THEN NULL ELSE json_build_object('id', cl.id, 'name', cl.name, 'companyName', cl.company_name) END AS client,
  CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'fullName', u.full_name) END AS responsible,
  (SELECT json_build_object('text', coalesce(m.text, m.summary), 'direction', m.direction, 'createdAt', m.created_at)
     FROM telegram_messages m WHERE m.contact_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS "lastMessage",
  (SELECT count(*)::int FROM telegram_messages m WHERE m.contact_id = c.id AND m.direction = 'IN'
     AND m.created_at > coalesce((SELECT r.last_read_at FROM telegram_reads r WHERE r.contact_id = c.id AND r.user_id = $${me}), '-infinity')) AS unread,
  coalesce((SELECT json_agg(json_build_object('id', d.id, 'title', d.title)) FROM telegram_deal_links l JOIN deals d ON d.id = l.deal_id WHERE l.contact_id = c.id), '[]') AS deals`;

const contactFrom = `FROM telegram_contacts c LEFT JOIN clients cl ON cl.id = c.client_id LEFT JOIN users u ON u.id = c.responsible_id`;

async function contactView(auth: AuthContext, id: string): Promise<Record<string, unknown>> {
  return (await query(`SELECT ${contactColumns(2)} ${contactFrom} WHERE c.id = $1`, [id, auth.userId])).rows[0]!;
}

telegramRouter.get("/status", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const company = await botCompanyId();
  const settings = (await query<{ bot_username: string | null; greeting_text: string; welcome_text: string; default_responsible_id: string | null; last_update_at: Date | null; last_error: string | null }>(
    "SELECT bot_username, greeting_text, welcome_text, default_responsible_id, last_update_at, last_error FROM telegram_settings WHERE company_id = $1", [auth.companyId])).rows[0];
  const base = { configured: telegramConfigured() && company === auth.companyId, botUsername: settings?.bot_username ?? null };
  if (auth.role !== "DIRECTOR") { res.json({ data: base }); return; }
  res.json({ data: {
    ...base, mode: config.TELEGRAM_MODE, lastUpdateAt: settings?.last_update_at ?? null, lastError: settings?.last_error ?? null,
    greetingText: settings?.greeting_text ?? null, welcomeText: settings?.welcome_text ?? null, defaultResponsibleId: settings?.default_responsible_id ?? null
  } });
}));

telegramRouter.patch("/settings", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  if (auth.role !== "DIRECTOR") await deny(req, auth, "TELEGRAM_SETTINGS_UPDATED", null, "Only a director changes the bot settings");
  const input = z.object({
    greetingText: z.string().trim().min(1).max(1000).optional(),
    welcomeText: z.string().trim().min(1).max(1000).optional(),
    defaultResponsibleId: z.string().uuid().nullable().optional()
  }).parse(req.body);
  if (input.defaultResponsibleId) {
    const user = await query("SELECT 1 FROM users WHERE id = $1 AND company_id = $2 AND status = 'ACTIVE'", [input.defaultResponsibleId, auth.companyId]);
    if (!user.rowCount) throw new ApiError(400, "TELEGRAM_INVALID_RESPONSIBLE", "Choose an active colleague");
  }
  await query(
    `INSERT INTO telegram_settings (company_id) VALUES ($1) ON CONFLICT DO NOTHING`, [auth.companyId]);
  await query(
    `UPDATE telegram_settings SET greeting_text = coalesce($2, greeting_text), welcome_text = coalesce($3, welcome_text),
       default_responsible_id = CASE WHEN $4 THEN $5::uuid ELSE default_responsible_id END, updated_by = $6, updated_at = now() WHERE company_id = $1`,
    [auth.companyId, input.greetingText ?? null, input.welcomeText ?? null, input.defaultResponsibleId !== undefined, input.defaultResponsibleId ?? null, auth.userId]
  );
  await writeAudit(req, { auth, action: "TELEGRAM_SETTINGS_UPDATED", entityType: "telegram_settings", metadata: { fields: Object.keys(input) } });
  res.json({ data: { ok: true } });
}));

telegramRouter.post("/webhook/check", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  if (auth.role !== "DIRECTOR") await deny(req, auth, "TELEGRAM_SETTINGS_UPDATED", null, "Only a director checks the bot connection");
  assertConfigured();
  try {
    res.json({ data: await checkConnection() });
  } catch (error) {
    const message = error instanceof TelegramApiError ? error.description : "Telegram is unreachable";
    await query("UPDATE telegram_settings SET last_error = $2 WHERE company_id = $1", [auth.companyId, message]);
    throw new ApiError(502, "TELEGRAM_CHECK_FAILED", message);
  }
}));

telegramRouter.get("/contacts", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const filters = z.object({
    filter: z.enum(["mine", "unassigned", "all"]).default("all"), q: z.string().trim().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0)
  }).parse(req.query);
  const access = telegramAccessSql(auth, "c", 2);
  const values: unknown[] = [auth.userId, ...access.values];
  const clauses = [access.sql];
  if (filters.filter === "mine") clauses.push("c.responsible_id = $1");
  if (filters.filter === "unassigned") clauses.push("c.responsible_id IS NULL");
  if (filters.q) {
    values.push(`%${filters.q.replace(/[%_\\]/g, "\\$&")}%`);
    clauses.push(`(concat_ws(' ', c.first_name, c.last_name, c.username, cl.name, cl.company_name) ILIKE $${values.length})`);
  }
  values.push(filters.limit + 1, filters.offset);
  const result = await query(
    `SELECT ${contactColumns(1)} ${contactFrom} WHERE ${clauses.join(" AND ")}
     ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  res.json({ data: result.rows.slice(0, filters.limit), meta: { hasMore: result.rows.length > filters.limit } });
}));

telegramRouter.get("/unread", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const triage = auth.role !== "EMPLOYEE" ? "OR c.responsible_id IS NULL" : "";
  const access = telegramAccessSql(auth, "c", 2);
  const result = await query<{ unread: number }>(
    `SELECT count(*)::int AS unread FROM telegram_messages m JOIN telegram_contacts c ON c.id = m.contact_id
     WHERE m.direction = 'IN' AND ${access.sql} AND (c.responsible_id = $1 ${triage})
       AND m.created_at > coalesce((SELECT r.last_read_at FROM telegram_reads r WHERE r.contact_id = c.id AND r.user_id = $1), '-infinity')`,
    [auth.userId, ...access.values]
  );
  res.json({ data: { unread: result.rows[0]?.unread ?? 0 } });
}));

telegramRouter.get("/contacts/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const contact = await visibleContact(auth, String(req.params.id));
  res.json({ data: await contactView(auth, contact.id) });
}));

export const messageColumns = `m.id, m.direction, m.text, m.kind, m.summary, m.file_name AS "fileName", m.mime_type AS "mimeType", m.file_size AS "fileSize",
  (m.stored_path IS NOT NULL) AS "fileReady", m.file_too_large AS "fileTooLarge", m.status, m.error, m.edited_at AS "editedAt", m.created_at AS "createdAt",
  m.reply_to_id AS "replyToId", CASE WHEN s.id IS NULL THEN NULL ELSE json_build_object('id', s.id, 'fullName', s.full_name) END AS "sentBy"`;

telegramRouter.get("/contacts/:id/messages", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const contact = await visibleContact(auth, String(req.params.id));
  const page = z.object({ before: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query);
  const values: unknown[] = [contact.id, page.limit + 1];
  let cursor = "";
  if (page.before) { values.push(page.before); cursor = "AND (m.created_at, m.id) < (SELECT b.created_at, b.id FROM telegram_messages b WHERE b.id = $3)"; }
  const result = await query(
    `SELECT ${messageColumns} FROM telegram_messages m LEFT JOIN users s ON s.id = m.sent_by
     WHERE m.contact_id = $1 ${cursor} ORDER BY m.created_at DESC, m.id DESC LIMIT $2`,
    values
  );
  res.json({ data: result.rows.slice(0, page.limit).reverse(), meta: { hasMore: result.rows.length > page.limit } });
}));

telegramRouter.post("/contacts/:id/read", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const contact = await visibleContact(auth, String(req.params.id));
  await query(
    `INSERT INTO telegram_reads (contact_id, user_id, last_read_at) VALUES ($1, $2, now())
     ON CONFLICT (contact_id, user_id) DO UPDATE SET last_read_at = now()`,
    [contact.id, auth.userId]
  );
  emitToUsers([auth.userId], "telegram:read", { contactId: contact.id });
  res.status(204).end();
}));

telegramRouter.post("/contacts/:id/messages", upload.single("file"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  assertConfigured();
  const contact = await visibleContact(auth, String(req.params.id));
  const input = z.object({ text: z.string().trim().max(4096).default(""), replyToId: z.string().uuid().optional() }).parse(req.body);
  const file = req.file;
  if (!input.text && !file) throw new ApiError(400, "TELEGRAM_EMPTY_MESSAGE", "Write a message or attach a file");
  if (file && input.text.length > 1024) throw new ApiError(400, "TELEGRAM_CAPTION_TOO_LONG", "A caption can be at most 1024 characters");
  if (contact.status === "BLOCKED") throw new ApiError(409, "TELEGRAM_CONTACT_BLOCKED", "The customer has blocked the bot");
  const replyTo = input.replyToId
    ? (await query<{ telegram_message_id: string | null }>("SELECT telegram_message_id::text FROM telegram_messages WHERE id = $1 AND contact_id = $2", [input.replyToId, contact.id])).rows[0]
    : undefined;
  const isPhoto = Boolean(file && /^image\/(jpeg|png|webp)$/.test(file.mimetype) && file.size <= 10 * 1024 * 1024);
  const stored = file ? await objectStorage.put({ companyId: auth.companyId, fileName: file.originalname, body: file.buffer }) : null;
  const created = await query<{ id: string }>(
    `INSERT INTO telegram_messages (contact_id, direction, text, kind, file_name, mime_type, file_size, stored_path, sent_by, status, reply_to_id)
     VALUES ($1, 'OUT', $2, $3, $4, $5, $6, $7, $8, 'SENDING', $9) RETURNING id`,
    [contact.id, input.text || null, file ? (isPhoto ? "PHOTO" : "DOCUMENT") : "TEXT", file?.originalname ?? null, file?.mimetype ?? null, file?.size ?? null, stored?.key ?? null, auth.userId, input.replyToId ?? null]
  );
  const messageId = created.rows[0]!.id;
  const chatId = Number(contact.telegram_user_id);
  const replyToTelegram = replyTo?.telegram_message_id ? Number(replyTo.telegram_message_id) : undefined;
  try {
    const sent = file
      ? await (isPhoto ? bot.sendPhoto : bot.sendDocument)(chatId, { buffer: file.buffer, name: file.originalname, type: file.mimetype }, input.text || undefined, replyToTelegram)
      : await bot.sendMessage(chatId, input.text, replyToTelegram);
    await query("UPDATE telegram_messages SET status = 'SENT', telegram_message_id = $2 WHERE id = $1", [messageId, sent.message_id]);
    await query("UPDATE telegram_contacts SET last_message_at = now(), status = CASE WHEN status = 'UNVERIFIED' THEN 'ACTIVE' ELSE status END WHERE id = $1", [contact.id]);
  } catch (error) {
    const blocked = error instanceof TelegramApiError && error.blocked;
    const unreachable = error instanceof TelegramApiError && error.chatNotFound;
    const reason = blocked ? "Клиент заблокировал бота" : unreachable ? "Клиент ещё не писал этому боту" : "Telegram не принял сообщение";
    await query("UPDATE telegram_messages SET status = 'FAILED', error = $2 WHERE id = $1", [messageId, reason]);
    if (blocked) await query("UPDATE telegram_contacts SET status = 'BLOCKED' WHERE id = $1", [contact.id]);
    await notifyContact(contact.id);
    if (blocked) throw new ApiError(409, "TELEGRAM_CONTACT_BLOCKED", "The customer has blocked the bot");
    if (unreachable) throw new ApiError(409, "TELEGRAM_CONTACT_UNREACHABLE", "The customer hasn't started this bot; send them an invite link");
    throw new ApiError(502, "TELEGRAM_SEND_FAILED", "Telegram did not accept the message");
  }
  await writeAudit(req, { auth, action: "TELEGRAM_MESSAGE_SENT", entityType: "telegram_contact", entityId: contact.id, departmentId: contact.department_id, metadata: { contactId: contact.id, clientId: contact.client_id } });
  await query(
    `INSERT INTO telegram_reads (contact_id, user_id, last_read_at) VALUES ($1, $2, now()) ON CONFLICT (contact_id, user_id) DO UPDATE SET last_read_at = now()`,
    [contact.id, auth.userId]
  );
  await notifyContact(contact.id);
  const message = (await query(`SELECT ${messageColumns} FROM telegram_messages m LEFT JOIN users s ON s.id = m.sent_by WHERE m.id = $1`, [messageId])).rows[0];
  res.status(201).json({ data: message });
}));

/** The owner of the conversation or anyone who sees its client or a linked deal may download its files. */
export async function canReadTelegram(auth: AuthContext, contactId: string): Promise<boolean> {
  const access = telegramAccessSql(auth, "c", 2);
  if ((await query(`SELECT 1 FROM telegram_contacts c WHERE c.id = $1 AND ${access.sql}`, [contactId, ...access.values])).rowCount) return true;
  const contact = (await query<{ client_id: string | null }>("SELECT client_id FROM telegram_contacts WHERE id = $1 AND company_id = $2", [contactId, auth.companyId])).rows[0];
  if (!contact) return false;
  if (contact.client_id) {
    const scope = recordScope(auth, {}, 2);
    if ((await query(`SELECT 1 FROM clients WHERE id = $1 AND ${scope.sql}`, [contact.client_id, ...scope.values])).rowCount) return true;
  }
  const scope = dealScope(auth, 2);
  return Boolean((await query(`SELECT 1 FROM telegram_deal_links l JOIN deals d ON d.id = l.deal_id WHERE l.contact_id = $1 AND ${scope.sql}`, [contactId, ...scope.values])).rowCount);
}

telegramRouter.get("/files/:messageId", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const message = (await query<{ contact_id: string; stored_path: string | null; file_name: string | null }>(
    "SELECT contact_id, stored_path, file_name FROM telegram_messages WHERE id = $1", [idSchema.parse(req.params.messageId)])).rows[0];
  if (!message || !await canReadTelegram(auth, message.contact_id)) throw new ApiError(404, "TELEGRAM_CONTACT_NOT_FOUND", "File not found");
  if (!message.stored_path) throw new ApiError(409, "TELEGRAM_FILE_PENDING", "The file is not downloaded yet");
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(message.file_name ?? "file")}`);
  (await objectStorage.get(message.stored_path)).pipe(res);
}));

async function assertClientVisible(auth: AuthContext, clientId: string): Promise<{ department_id: string | null }> {
  const scope = recordScope(auth, {}, 2);
  const client = (await query<{ department_id: string | null }>(`SELECT department_id FROM clients WHERE id = $1 AND ${scope.sql}`, [clientId, ...scope.values])).rows[0];
  if (!client) throw new ApiError(404, "CLIENT_NOT_FOUND", "Client not found");
  return client;
}

/** Bind a client and/or change the responsible user: directors anyone, heads within their department, employees only the client of their own contact. */
telegramRouter.patch("/contacts/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const contact = await visibleContact(auth, String(req.params.id));
  const input = z.object({ clientId: z.string().uuid().nullable().optional(), responsibleId: z.string().uuid().nullable().optional() }).parse(req.body);
  if (input.clientId) await assertClientVisible(auth, input.clientId);
  if (input.responsibleId !== undefined && input.responsibleId !== contact.responsible_id) {
    if (auth.role === "EMPLOYEE") await deny(req, auth, "TELEGRAM_CONTACT_REASSIGNED", contact.id, "Only a director or department head reassigns conversations");
    if (input.responsibleId) {
      const target = (await query<{ department_id: string | null }>("SELECT department_id FROM users WHERE id = $1 AND company_id = $2 AND status = 'ACTIVE'", [input.responsibleId, auth.companyId])).rows[0];
      if (!target) throw new ApiError(400, "TELEGRAM_INVALID_RESPONSIBLE", "Choose an active colleague");
      if (auth.role === "MANAGER" && target.department_id !== auth.departmentId) await deny(req, auth, "TELEGRAM_CONTACT_REASSIGNED", contact.id, "Heads reassign only within their department");
    }
  }
  const before = { clientId: contact.client_id, responsibleId: contact.responsible_id };
  await query(
    `UPDATE telegram_contacts SET client_id = CASE WHEN $2 THEN $3::uuid ELSE client_id END, responsible_id = CASE WHEN $4 THEN $5::uuid ELSE responsible_id END,
       bound_via = CASE WHEN $2 AND $3::uuid IS NOT NULL THEN 'TRIAGE' ELSE bound_via END WHERE id = $1`,
    [contact.id, input.clientId !== undefined, input.clientId ?? null, input.responsibleId !== undefined, input.responsibleId ?? null]
  );
  if (input.clientId !== undefined && input.clientId !== before.clientId) {
    await writeAudit(req, { auth, action: "TELEGRAM_CONTACT_BOUND", entityType: "telegram_contact", entityId: contact.id, metadata: { contactId: contact.id, clientId: input.clientId, source: "TRIAGE" } });
  }
  if (input.responsibleId !== undefined && input.responsibleId !== before.responsibleId) {
    await writeAudit(req, { auth, action: "TELEGRAM_CONTACT_REASSIGNED", entityType: "telegram_contact", entityId: contact.id, metadata: { from: before.responsibleId, to: input.responsibleId } });
  }
  const audience = await contactAudience(contact);
  await notifyContact(contact.id, "telegram:contact");
  emitToUsers(audience, "telegram:contact", { contactId: contact.id });
  res.json({ data: await contactView(auth, contact.id) });
}));

telegramRouter.post("/contacts/:id/client", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const contact = await visibleContact(auth, String(req.params.id));
  const clientId = await createClient(req, auth, req.body);
  await query("UPDATE telegram_contacts SET client_id = $2, bound_via = 'TRIAGE', responsible_id = coalesce(responsible_id, $3) WHERE id = $1", [contact.id, clientId, auth.userId]);
  await writeAudit(req, { auth, action: "TELEGRAM_CONTACT_BOUND", entityType: "telegram_contact", entityId: contact.id, metadata: { contactId: contact.id, clientId, source: "TRIAGE", created: "client" } });
  await notifyContact(contact.id, "telegram:contact");
  res.status(201).json({ data: { clientId } });
}));

telegramRouter.post("/contacts/:id/deal", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const contact = await visibleContact(auth, String(req.params.id));
  const body = (req.body ?? {}) as Record<string, unknown>;
  const clientId = (body.clientId as string | undefined) ?? contact.client_id;
  if (!clientId) throw new ApiError(400, "CLIENT_REQUIRED", "Link the conversation to a client first");
  const dealId = await createDeal(req, auth, { title: "Сделка из Telegram", ...body, clientId });
  await transaction(async (client) => {
    await client.query("UPDATE telegram_contacts SET client_id = coalesce(client_id, $2) WHERE id = $1", [contact.id, clientId]);
    await client.query("INSERT INTO telegram_deal_links (contact_id, deal_id, linked_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [contact.id, dealId, auth.userId]);
  });
  await writeAudit(req, { auth, action: "TELEGRAM_CONTACT_BOUND", entityType: "telegram_contact", entityId: contact.id, metadata: { contactId: contact.id, clientId, dealId, source: "TRIAGE", created: "deal" } });
  res.status(201).json({ data: { clientId, dealId } });
}));

telegramRouter.delete("/contacts/:id/deals/:dealId", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const contact = await visibleContact(auth, String(req.params.id));
  await query("DELETE FROM telegram_deal_links WHERE contact_id = $1 AND deal_id = $2", [contact.id, idSchema.parse(req.params.dealId)]);
  res.status(204).end();
}));

/** Directors can erase a customer's conversation with its files (for example on a data deletion request). */
telegramRouter.delete("/contacts/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const contact = await visibleContact(auth, String(req.params.id));
  if (auth.role !== "DIRECTOR") await deny(req, auth, "TELEGRAM_CONTACT_DELETED", contact.id, "Only a director deletes conversations");
  const files = await query<{ stored_path: string }>("SELECT stored_path FROM telegram_messages WHERE contact_id = $1 AND stored_path IS NOT NULL", [contact.id]);
  await query("DELETE FROM telegram_contacts WHERE id = $1", [contact.id]);
  for (const file of files.rows) await objectStorage.delete(file.stored_path).catch(() => undefined);
  await writeAudit(req, { auth, action: "TELEGRAM_CONTACT_DELETED", entityType: "telegram_contact", entityId: contact.id, metadata: { messages: files.rowCount } });
  res.status(204).end();
}));

telegramRouter.post("/import/preview", csvUpload.single("file"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  if (auth.role === "EMPLOYEE") await deny(req, auth, "TELEGRAM_CONTACTS_IMPORT", null, "Only directors and department heads import contacts");
  const csv = req.file ? req.file.buffer.toString("utf8") : z.object({ csv: z.string().min(1).max(5 * 1024 * 1024) }).parse(req.body).csv;
  const preview = await previewImport(auth, csv);
  const count = (status: string) => preview.rows.filter((row) => row.status === status).length;
  res.status(201).json({ data: { id: preview.id, rows: preview.rows, summary: { new: count("NEW"), update: count("UPDATE"), unchanged: count("UNCHANGED"), error: count("ERROR") } } });
}));

telegramRouter.post("/import/:previewId/apply", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  if (auth.role === "EMPLOYEE") await deny(req, auth, "TELEGRAM_CONTACTS_IMPORT", null, "Only directors and department heads import contacts");
  const result = await applyImport(auth, idSchema.parse(req.params.previewId));
  await writeAudit(req, { auth, action: "TELEGRAM_CONTACTS_IMPORTED", entityType: "telegram_contact", metadata: result });
  res.json({ data: result });
}));

/** `POST /api/v1/clients/:id/telegram-invite`: a personal, single-use t.me link valid for 30 days. Only a hash is stored. */
export const createInvite = asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  assertConfigured();
  const clientId = idSchema.parse(req.params.id);
  await assertClientVisible(auth, clientId);
  const username = (await query<{ bot_username: string | null }>("SELECT bot_username FROM telegram_settings WHERE company_id = $1", [auth.companyId])).rows[0]?.bot_username;
  if (!username) throw new ApiError(503, "TELEGRAM_UNCONFIGURED", "The bot username is unknown; ask a director to check the bot connection");
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  await query("INSERT INTO telegram_invites (company_id, client_id, created_by, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5)",
    [auth.companyId, clientId, auth.userId, hashToken(token), expiresAt]);
  await writeAudit(req, { auth, action: "TELEGRAM_INVITE_CREATED", entityType: "client", entityId: clientId, metadata: { clientId } });
  res.status(201).json({ data: { url: `https://t.me/${username}?start=${token}`, expiresAt } });
});
