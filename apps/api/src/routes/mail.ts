import { Router, type Request } from "express";
import multer from "multer";
import { z } from "zod";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { config } from "../config";
import { query } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { applyAction, MAIL_ACTIONS } from "../mail/actions";
import { attachmentStream, cacheLinkedAttachments } from "../mail/attachments";
import { assertMailKey, mailKeyConfigured, openSecret, sealSecret, type SealedSecret } from "../mail/crypto";
import { authorizationUrl, consumeState, createState, exchangeCode, PROVIDER_SERVERS, providerConfigured, revokeGrant, type OAuthProvider } from "../mail/oauth";
import { withRemoteImages } from "../mail/sanitize";
import { syncWithLock } from "../mail/scheduler";
import { sendDraft, type DraftRow } from "../mail/send";
import { loadAccount } from "../mail/sync";
import { connectionError, failureReason, isDemoSecret, testConnection, type MailAccountRow, type ServerSettings } from "../mail/transport";
import { objectStorage } from "../storage";
import { recordScope } from "../scope";
import type { AuthContext } from "../types";
import { createClient } from "./clients";
import { createDeal, dealScope } from "./deals";

export const MAX_MAILBOXES = 5;

const idSchema = z.string().uuid();
const security = z.enum(["SSL", "STARTTLS"]);
const serverSchema = z.object({ host: z.string().trim().min(1).max(253), port: z.coerce.number().int(), security });
const addressSchema = z.object({ address: z.string().trim().toLowerCase().email().max(320), name: z.string().trim().max(200).optional() });
const addressList = z.array(addressSchema).max(100).default([]);
export const imapAccountSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  displayName: z.string().trim().max(200).nullable().optional(),
  imap: serverSchema,
  smtp: serverSchema,
  username: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(1000),
  signature: z.string().max(2000).nullable().optional()
});
const accountPatchSchema = z.object({
  displayName: z.string().trim().max(200).nullable().optional(),
  signature: z.string().max(2000).nullable().optional(),
  imap: serverSchema.optional(),
  smtp: serverSchema.optional(),
  username: z.string().trim().min(1).max(320).optional(),
  password: z.string().min(1).max(1000).optional()
});
const draftSchema = z.object({
  accountId: z.string().uuid(),
  mode: z.enum(["NEW", "REPLY", "REPLY_ALL", "FORWARD"]).default("NEW"),
  sourceMessageId: z.string().uuid().nullable().optional(),
  to: addressList, cc: addressList, bcc: addressList,
  subject: z.string().max(998).default(""),
  html: z.string().max(2_000_000).default(""),
  forwardAttachmentIds: z.array(z.string().uuid()).max(50).default([]),
  clientId: z.string().uuid().nullable().optional(),
  dealId: z.string().uuid().nullable().optional()
});
const draftPatchSchema = draftSchema.omit({ mode: true, sourceMessageId: true, forwardAttachmentIds: true }).partial();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 10 } });

export const mailRouter = Router();

const providerKey = (value: string): OAuthProvider => {
  const provider = value.toUpperCase();
  if (provider !== "GOOGLE" && provider !== "MICROSOFT") throw new ApiError(404, "NOT_FOUND", "Unknown provider");
  return provider;
};

/** Which ways of connecting a mailbox this server supports. */
export function mailProviders(): Record<"imap" | "google" | "microsoft", boolean> {
  const key = mailKeyConfigured();
  return { imap: key, google: key && providerConfigured("GOOGLE"), microsoft: key && providerConfigured("MICROSOFT") };
}

const accountColumns = `a.id, a.provider, a.email, a.display_name AS "displayName", a.imap_host AS "imapHost", a.imap_port AS "imapPort",
  a.imap_security AS "imapSecurity", a.smtp_host AS "smtpHost", a.smtp_port AS "smtpPort", a.smtp_security AS "smtpSecurity",
  a.username, a.signature, a.status, a.status_reason AS "statusReason", a.last_synced_at AS "lastSyncedAt", a.created_at AS "createdAt",
  (a.secret ? 'demo') AS demo,
  coalesce((SELECT sum(f.unread)::int FROM mail_folders f WHERE f.account_id = a.id AND f.special_use = 'INBOX'), 0) AS unread`;

/** The caller's own mailbox; anyone else's, whatever their role, is 404. */
async function ownAccount(auth: AuthContext, id: string): Promise<MailAccountRow> {
  const result = await query<MailAccountRow>("SELECT * FROM mail_accounts WHERE id = $1 AND user_id = $2", [idSchema.parse(id), auth.userId]);
  if (!result.rows[0]) throw new ApiError(404, "MAIL_NOT_FOUND", "Mailbox not found");
  return result.rows[0];
}

async function accountView(id: string): Promise<Record<string, unknown>> {
  return (await query(`SELECT ${accountColumns} FROM mail_accounts a WHERE a.id = $1`, [id])).rows[0]!;
}

function triggerSync(account: Pick<MailAccountRow, "id" | "user_id">, full = true): void {
  void syncWithLock(account.id, account.user_id, { full }).catch(() => undefined);
}

async function auditConnectFailure(req: Request, auth: AuthContext, provider: string, error: unknown): Promise<void> {
  await writeAudit(req, { auth, action: "MAIL_ACCOUNT_CONNECT_FAILED", entityType: "mail_account", metadata: { provider, reason: failureReason(error) } });
}

async function assertCanAdd(auth: AuthContext, email: string, exceptId?: string): Promise<void> {
  const existing = await query<{ id: string }>("SELECT id FROM mail_accounts WHERE user_id = $1 AND lower(email) = lower($2)", [auth.userId, email]);
  if (existing.rows[0] && existing.rows[0].id !== exceptId) throw new ApiError(409, "MAIL_ACCOUNT_EXISTS", "This mailbox is already connected");
  if (!exceptId && !existing.rows[0]) {
    const count = await query<{ count: number }>("SELECT count(*)::int AS count FROM mail_accounts WHERE user_id = $1", [auth.userId]);
    if ((count.rows[0]?.count ?? 0) >= MAX_MAILBOXES) throw new ApiError(400, "MAIL_ACCOUNT_LIMIT", `At most ${MAX_MAILBOXES} mailboxes per user`);
  }
}

mailRouter.get("/providers", asyncHandler(async (_req, res) => {
  res.json({ data: mailProviders() });
}));

mailRouter.get("/accounts", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const result = await query(`SELECT ${accountColumns} FROM mail_accounts a WHERE a.user_id = $1 ORDER BY a.created_at`, [auth.userId]);
  res.json({ data: result.rows });
}));

mailRouter.post("/accounts/test", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  assertMailKey();
  const input = imapAccountSchema.parse(req.body);
  try {
    await testConnection({ imap: input.imap, smtp: input.smtp, username: input.username }, { user: input.username, pass: input.password });
  } catch (error) {
    await auditConnectFailure(req, auth, "IMAP", error);
    throw connectionError(error, "IMAP");
  }
  res.json({ data: { ok: true } });
}));

mailRouter.post("/accounts", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  assertMailKey();
  const input = imapAccountSchema.parse(req.body);
  await assertCanAdd(auth, input.email);
  try {
    await testConnection({ imap: input.imap, smtp: input.smtp, username: input.username }, { user: input.username, pass: input.password });
  } catch (error) {
    await auditConnectFailure(req, auth, "IMAP", error);
    throw connectionError(error, "IMAP");
  }
  const created = await query<{ id: string }>(
    `INSERT INTO mail_accounts (company_id, user_id, provider, email, display_name, imap_host, imap_port, imap_security, smtp_host, smtp_port, smtp_security, username, secret, signature)
     VALUES ($1, $2, 'IMAP', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
    [auth.companyId, auth.userId, input.email, input.displayName || null, input.imap.host, input.imap.port, input.imap.security,
      input.smtp.host, input.smtp.port, input.smtp.security, input.username, JSON.stringify(sealSecret(input.password)), input.signature || null]
  );
  const id = created.rows[0]!.id;
  await writeAudit(req, { auth, action: "MAIL_ACCOUNT_CONNECTED", entityType: "mail_account", entityId: id, metadata: { provider: "IMAP" } });
  triggerSync({ id, user_id: auth.userId });
  res.status(201).json({ data: await accountView(id) });
}));

mailRouter.get("/oauth/:provider/start", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  assertMailKey();
  const provider = providerKey(String(req.params.provider));
  if (!providerConfigured(provider)) throw new ApiError(501, "MAIL_PROVIDER_UNAVAILABLE", "This mail provider is not configured on the server");
  const { loginHint } = z.object({ loginHint: z.string().email().optional() }).parse(req.query);
  res.json({ data: { url: authorizationUrl(provider, await createState(auth.userId, provider), loginHint) } });
}));

mailRouter.post("/oauth/:provider/complete", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  assertMailKey();
  const provider = providerKey(String(req.params.provider));
  const { code, state } = z.object({ code: z.string().min(1).max(4000), state: z.string().min(1).max(1000) }).parse(req.body);
  await consumeState(state, auth.userId, provider);
  let tokens;
  try {
    tokens = await exchangeCode(provider, code);
  } catch (error) {
    await auditConnectFailure(req, auth, provider, error);
    throw error;
  }
  if (!tokens.refreshToken || !tokens.email) {
    await auditConnectFailure(req, auth, provider, new Error("no offline access"));
    throw new ApiError(400, "MAIL_OAUTH_FAILED", "The provider did not grant offline mail access; try again and accept all permissions");
  }
  const servers = PROVIDER_SERVERS[provider];
  const email = tokens.email.toLowerCase();
  try {
    await testConnection({ imap: servers.imap, smtp: servers.smtp, username: email }, { user: email, accessToken: tokens.accessToken });
  } catch (error) {
    await auditConnectFailure(req, auth, provider, error);
    throw connectionError(error, "IMAP");
  }
  const existing = await query<{ id: string }>("SELECT id FROM mail_accounts WHERE user_id = $1 AND lower(email) = $2", [auth.userId, email]);
  let id = existing.rows[0]?.id;
  if (id) {
    await query(
      `UPDATE mail_accounts SET provider = $2, secret = $3, status = 'CONNECTED', status_reason = NULL, failures = 0, next_sync_at = now(),
         imap_host = $4, imap_port = $5, imap_security = $6, smtp_host = $7, smtp_port = $8, smtp_security = $9, username = $10 WHERE id = $1`,
      [id, provider, JSON.stringify(sealSecret(tokens.refreshToken)), servers.imap.host, servers.imap.port, servers.imap.security,
        servers.smtp.host, servers.smtp.port, servers.smtp.security, email]
    );
  } else {
    await assertCanAdd(auth, email);
    const created = await query<{ id: string }>(
      `INSERT INTO mail_accounts (company_id, user_id, provider, email, display_name, imap_host, imap_port, imap_security, smtp_host, smtp_port, smtp_security, username, secret)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [auth.companyId, auth.userId, provider, email, tokens.name ?? null, servers.imap.host, servers.imap.port, servers.imap.security,
        servers.smtp.host, servers.smtp.port, servers.smtp.security, email, JSON.stringify(sealSecret(tokens.refreshToken))]
    );
    id = created.rows[0]!.id;
  }
  await writeAudit(req, { auth, action: "MAIL_ACCOUNT_CONNECTED", entityType: "mail_account", entityId: id, metadata: { provider } });
  triggerSync({ id, user_id: auth.userId });
  res.status(existing.rows[0] ? 200 : 201).json({ data: await accountView(id) });
}));

mailRouter.patch("/accounts/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const account = await ownAccount(auth, String(req.params.id));
  const input = accountPatchSchema.parse(req.body);
  const credentialsChanged = input.imap || input.smtp || input.username || input.password;
  if (credentialsChanged) {
    if (account.provider !== "IMAP") throw new ApiError(400, "MAIL_OAUTH_SETTINGS", "Reconnect this mailbox through its provider instead");
    assertMailKey();
    const settings: ServerSettings = {
      imap: input.imap ?? { host: account.imap_host, port: account.imap_port, security: account.imap_security },
      smtp: input.smtp ?? { host: account.smtp_host, port: account.smtp_port, security: account.smtp_security },
      username: input.username ?? account.username
    };
    const password = input.password ?? (isDemoSecret(account.secret) ? "" : openSecret(account.secret as SealedSecret));
    try {
      await testConnection(settings, { user: settings.username, pass: password });
    } catch (error) {
      await auditConnectFailure(req, auth, "IMAP", error);
      throw connectionError(error, "IMAP");
    }
    await query(
      `UPDATE mail_accounts SET imap_host = $2, imap_port = $3, imap_security = $4, smtp_host = $5, smtp_port = $6, smtp_security = $7, username = $8,
         secret = $9, status = 'CONNECTED', status_reason = NULL, failures = 0, next_sync_at = now() WHERE id = $1`,
      [account.id, settings.imap.host, settings.imap.port, settings.imap.security, settings.smtp.host, settings.smtp.port, settings.smtp.security,
        settings.username, JSON.stringify(sealSecret(password))]
    );
    await writeAudit(req, { auth, action: "MAIL_ACCOUNT_CONNECTED", entityType: "mail_account", entityId: account.id, metadata: { provider: "IMAP", reconnected: true } });
    triggerSync(account);
  }
  if (input.displayName !== undefined || input.signature !== undefined) {
    await query(
      `UPDATE mail_accounts SET display_name = CASE WHEN $2 THEN $3 ELSE display_name END, signature = CASE WHEN $4 THEN $5 ELSE signature END WHERE id = $1`,
      [account.id, input.displayName !== undefined, input.displayName || null, input.signature !== undefined, input.signature || null]
    );
  }
  res.json({ data: await accountView(account.id) });
}));

mailRouter.post("/accounts/:id/sync", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const account = await ownAccount(auth, String(req.params.id));
  if (account.status !== "CONNECTED") throw new ApiError(409, "MAIL_ACCOUNT_UNAVAILABLE", "Reconnect this mailbox first");
  await query("UPDATE mail_accounts SET next_sync_at = now() WHERE id = $1", [account.id]);
  triggerSync(account);
  res.status(202).json({ data: { queued: true } });
}));

mailRouter.delete("/accounts/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const account = await ownAccount(auth, String(req.params.id));
  // Linked correspondence stays as client history: keep its attachments before the credentials go.
  if (!isDemoSecret(account.secret)) await Promise.race([cacheLinkedAttachments(account.id), new Promise((resolve) => setTimeout(resolve, 20_000))]).catch(() => undefined);
  await query("DELETE FROM mail_threads WHERE account_id = $1 AND client_id IS NULL AND deal_id IS NULL", [account.id]);
  await query("DELETE FROM mail_accounts WHERE id = $1", [account.id]);
  if (account.provider !== "IMAP" && !isDemoSecret(account.secret)) {
    await revokeGrant(account.provider, openSecret(account.secret as SealedSecret)).catch(() => undefined);
  }
  await writeAudit(req, { auth, action: "MAIL_ACCOUNT_DISCONNECTED", entityType: "mail_account", entityId: account.id, metadata: { provider: account.provider } });
  res.status(204).end();
}));

mailRouter.get("/accounts/:id/folders", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const account = await ownAccount(auth, String(req.params.id));
  const result = await query(
    `SELECT id, path, name, special_use AS "specialUse", total, unread FROM mail_folders WHERE account_id = $1
     ORDER BY array_position(ARRAY['INBOX','SENT','DRAFTS','ARCHIVE','JUNK','TRASH','ALL'], special_use) NULLS LAST, lower(name)`,
    [account.id]
  );
  res.json({ data: result.rows });
}));

const threadColumns = `t.id, t.account_id AS "accountId", t.mailbox_email AS "mailboxEmail", t.subject, t.last_message_at AS "lastMessageAt",
  t.message_count AS "messageCount", t.unread_count AS "unreadCount", t.has_attachments AS "hasAttachments", t.participants,
  t.link_source AS "linkSource", t.user_id AS "ownerId",
  (SELECT m.snippet FROM mail_messages m WHERE m.thread_id = t.id ORDER BY m.sent_at DESC LIMIT 1) AS snippet,
  EXISTS (SELECT 1 FROM mail_messages m WHERE m.thread_id = t.id AND m.flagged) AS flagged,
  (SELECT string_agg(DISTINCT coalesce(nullif(m.from_name, ''), m.from_address), ', ') FROM mail_messages m
     WHERE m.thread_id = t.id AND lower(m.from_address) <> lower(t.mailbox_email)) AS correspondents,
  EXISTS (SELECT 1 FROM mail_messages m WHERE m.thread_id = t.id AND m.send_status = 'FAILED') AS "sendFailed",
  CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('id', c.id, 'name', c.name, 'companyName', c.company_name) END AS client,
  CASE WHEN d.id IS NULL THEN NULL ELSE json_build_object('id', d.id, 'title', d.title) END AS deal`;

mailRouter.get("/threads", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const filters = z.object({
    accountId: z.string().uuid().optional(), folderId: z.string().uuid().optional(), q: z.string().trim().max(200).optional(),
    starred: z.enum(["true"]).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0)
  }).parse(req.query);
  const values: unknown[] = [auth.userId];
  const clauses = ["t.user_id = $1", "t.account_id IS NOT NULL"];
  const messageClauses: string[] = [];
  if (filters.accountId) { values.push(filters.accountId); clauses.push(`t.account_id = $${values.length}`); }
  if (filters.folderId) { values.push(filters.folderId); messageClauses.push(`m.folder_id = $${values.length}`); }
  if (filters.q) { values.push(filters.q); messageClauses.push(`m.search @@ plainto_tsquery('simple', $${values.length})`); }
  if (filters.starred) messageClauses.push("m.flagged");
  if (messageClauses.length) clauses.push(`EXISTS (SELECT 1 FROM mail_messages m WHERE m.thread_id = t.id AND ${messageClauses.join(" AND ")})`);
  values.push(filters.limit + 1, filters.offset);
  const result = await query(
    `SELECT ${threadColumns} FROM mail_threads t LEFT JOIN clients c ON c.id = t.client_id LEFT JOIN deals d ON d.id = t.deal_id
     WHERE ${clauses.join(" AND ")} ORDER BY t.last_message_at DESC, t.id LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  res.json({ data: result.rows.slice(0, filters.limit), meta: { hasMore: result.rows.length > filters.limit, offset: filters.offset } });
}));

/** Thread messages, de-duplicated across folders (the same message can sit in Inbox and a label folder). */
export async function threadMessages(threadId: string, includeBcc: boolean): Promise<Record<string, unknown>[]> {
  const result = await query(
    `SELECT DISTINCT ON (coalesce(m.message_id_header, m.id::text)) m.id, m.from_address AS "fromAddress", m.from_name AS "fromName",
            m.to_addresses AS "to", m.cc_addresses AS "cc", ${includeBcc ? `m.bcc_addresses` : `'[]'::jsonb`} AS "bcc", m.reply_to AS "replyTo",
            m.subject, m.snippet, m.text_body AS "text", m.html_body AS "html", m.has_remote_images AS "hasRemoteImages", m.sent_at AS "sentAt",
            m.seen, m.flagged, m.answered, m.send_status AS "sendStatus", m.send_error AS "sendError", m.message_id_header AS "messageIdHeader",
            f.id AS "folderId", f.name AS "folderName", f.special_use AS "folderSpecialUse",
            coalesce((SELECT json_agg(json_build_object('id', a.id, 'filename', a.filename, 'contentType', a.content_type, 'size', a.size) ORDER BY a.part_id)
                      FROM mail_attachments a WHERE a.message_id = m.id AND NOT a.inline), '[]') AS attachments
     FROM mail_messages m LEFT JOIN mail_folders f ON f.id = m.folder_id
     WHERE m.thread_id = $1
     ORDER BY coalesce(m.message_id_header, m.id::text), (f.special_use = 'INBOX') DESC NULLS LAST, (f.special_use = 'SENT') DESC NULLS LAST`,
    [threadId]
  );
  return result.rows.sort((a, b) => new Date(a.sentAt as string).getTime() - new Date(b.sentAt as string).getTime());
}

async function ownThread(auth: AuthContext, id: string): Promise<Record<string, unknown> & { id: string; account_id: string | null }> {
  const result = await query<Record<string, unknown> & { id: string; account_id: string | null }>(
    `SELECT ${threadColumns}, t.account_id, t.link_suggestions FROM mail_threads t LEFT JOIN clients c ON c.id = t.client_id LEFT JOIN deals d ON d.id = t.deal_id
     WHERE t.id = $1 AND t.user_id = $2`,
    [idSchema.parse(id), auth.userId]
  );
  if (!result.rows[0]) throw new ApiError(404, "MAIL_NOT_FOUND", "Conversation not found");
  return result.rows[0];
}

mailRouter.get("/threads/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const thread = await ownThread(auth, String(req.params.id));
  const messages = await threadMessages(thread.id, true);
  const suggestions = (thread.link_suggestions as string[]).length
    ? (await query("SELECT id, name, company_name AS \"companyName\", email FROM clients WHERE id = ANY($1::uuid[])", [thread.link_suggestions])).rows
    : [];
  const unread = messages.filter((message) => !message.seen && !message.sendStatus).map((message) => message.id as string);
  if (unread.length && thread.account_id) {
    const account = await loadAccount(thread.account_id);
    if (account) void applyAction(account, unread, "read").catch(() => undefined);
    await query(
      `UPDATE mail_folders f SET unread = greatest(0, f.unread - x.count) FROM (
         SELECT folder_id, count(*)::int AS count FROM mail_messages WHERE id = ANY($1::uuid[]) AND folder_id IS NOT NULL GROUP BY folder_id
       ) x WHERE x.folder_id = f.id`,
      [unread]
    );
    await query("UPDATE mail_messages SET seen = true WHERE id = ANY($1::uuid[])", [unread]);
    await query("UPDATE mail_threads SET unread_count = 0 WHERE id = $1", [thread.id]);
  }
  const { link_suggestions: _suggestions, account_id: _account, ...rest } = thread;
  res.json({ data: { ...rest, unreadCount: 0, linkSuggestions: suggestions, messages: messages.map((message) => ({ ...message, seen: true })) } });
}));

/** The owner, or anyone who can see the thread's linked client or deal (read-only history). */
export async function canReadThread(auth: AuthContext, threadId: string): Promise<boolean> {
  const thread = await query<{ user_id: string; client_id: string | null; deal_id: string | null }>("SELECT user_id, client_id, deal_id FROM mail_threads WHERE id = $1", [threadId]);
  const row = thread.rows[0];
  if (!row) return false;
  if (row.user_id === auth.userId) return true;
  if (row.client_id) {
    const scope = recordScope(auth, {}, 2);
    if ((await query(`SELECT 1 FROM clients WHERE id = $1 AND ${scope.sql}`, [row.client_id, ...scope.values])).rowCount) return true;
  }
  if (row.deal_id) {
    const scope = dealScope(auth, 2);
    if ((await query(`SELECT 1 FROM deals d WHERE d.id = $1 AND ${scope.sql}`, [row.deal_id, ...scope.values])).rowCount) return true;
  }
  return false;
}

async function messageThread(messageId: string): Promise<string> {
  const result = await query<{ thread_id: string }>("SELECT thread_id FROM mail_messages WHERE id = $1", [idSchema.parse(messageId)]);
  if (!result.rows[0]) throw new ApiError(404, "MAIL_NOT_FOUND", "Message not found");
  return result.rows[0].thread_id;
}

mailRouter.get("/attachments/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const owner = await query<{ thread_id: string }>("SELECT m.thread_id FROM mail_attachments a JOIN mail_messages m ON m.id = a.message_id WHERE a.id = $1", [id]);
  if (!owner.rows[0] || !await canReadThread(auth, owner.rows[0].thread_id)) {
    if (owner.rows[0]) await writeAudit(req, { auth, action: "MAIL_HISTORY_ACCESS_DENIED", entityType: "mail_thread", entityId: owner.rows[0].thread_id });
    throw new ApiError(404, "MAIL_NOT_FOUND", "Attachment not found");
  }
  const file = await attachmentStream(id);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
  file.stream.pipe(res);
}));

mailRouter.post("/messages/:id/show-images", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const threadId = await messageThread(String(req.params.id));
  if (!await canReadThread(auth, threadId)) throw new ApiError(404, "MAIL_NOT_FOUND", "Message not found");
  const result = await query<{ html_body: string | null }>("SELECT html_body FROM mail_messages WHERE id = $1", [req.params.id]);
  res.json({ data: { html: withRemoteImages(result.rows[0]?.html_body ?? "") } });
}));

mailRouter.post("/actions", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const input = z.object({
    threadIds: z.array(z.string().uuid()).max(200).default([]),
    messageIds: z.array(z.string().uuid()).max(500).default([]),
    fromFolderId: z.string().uuid().optional(),
    action: z.enum(MAIL_ACTIONS),
    folderId: z.string().uuid().optional()
  }).parse(req.body);
  const values: unknown[] = [auth.userId, input.threadIds, input.messageIds];
  let folderClause = "";
  if (input.fromFolderId && input.threadIds.length) { values.push(input.fromFolderId); folderClause = `AND (m.thread_id <> ALL($2::uuid[]) OR m.folder_id = $${values.length})`; }
  const targets = await query<{ id: string; account_id: string }>(
    `SELECT m.id, m.account_id FROM mail_messages m JOIN mail_threads t ON t.id = m.thread_id
     WHERE t.user_id = $1 AND m.account_id IS NOT NULL AND (m.thread_id = ANY($2::uuid[]) OR m.id = ANY($3::uuid[])) ${folderClause}`,
    values
  );
  if (!targets.rows.length) throw new ApiError(404, "MAIL_NOT_FOUND", "Messages not found");
  const byAccount = new Map<string, string[]>();
  targets.rows.forEach((row) => byAccount.set(row.account_id, [...(byAccount.get(row.account_id) ?? []), row.id]));
  for (const [accountId, ids] of byAccount) {
    const account = await ownAccount(auth, accountId);
    try {
      await applyAction(account, ids, input.action, input.folderId);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(502, "MAIL_ACTION_FAILED", "The mail server rejected the action", { reason: failureReason(error) });
    }
  }
  res.json({ data: { count: targets.rows.length } });
}));

const draftColumns = `d.id, d.account_id AS "accountId", d.mode, d.source_message_id AS "sourceMessageId", d.to_addresses AS "to", d.cc_addresses AS "cc",
  d.bcc_addresses AS "bcc", d.subject, d.html, d.attachments, d.client_id AS "clientId", d.deal_id AS "dealId", d.updated_at AS "updatedAt"`;

async function ownDraft(auth: AuthContext, id: string): Promise<DraftRow> {
  const result = await query<DraftRow>("SELECT * FROM mail_drafts WHERE id = $1 AND user_id = $2", [idSchema.parse(id), auth.userId]);
  if (!result.rows[0]) throw new ApiError(404, "MAIL_NOT_FOUND", "Draft not found");
  return result.rows[0];
}

async function assertLinkTargets(auth: AuthContext, clientId?: string | null, dealId?: string | null): Promise<{ clientId: string | null; dealId: string | null }> {
  let client = clientId ?? null;
  if (dealId) {
    const scope = dealScope(auth, 2);
    const deal = await query<{ client_id: string }>(`SELECT d.client_id FROM deals d WHERE d.id = $1 AND ${scope.sql}`, [dealId, ...scope.values]);
    if (!deal.rows[0]) throw new ApiError(404, "DEAL_NOT_FOUND", "Deal not found");
    client = deal.rows[0].client_id;
  } else if (client) {
    const scope = recordScope(auth, {}, 2);
    if (!(await query(`SELECT 1 FROM clients WHERE id = $1 AND ${scope.sql}`, [client, ...scope.values])).rowCount) throw new ApiError(404, "CLIENT_NOT_FOUND", "Client not found");
  }
  return { clientId: client, dealId: dealId ?? null };
}

mailRouter.get("/drafts", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const result = await query(`SELECT ${draftColumns} FROM mail_drafts d WHERE d.user_id = $1 ORDER BY d.updated_at DESC`, [auth.userId]);
  res.json({ data: result.rows });
}));

mailRouter.post("/drafts", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const input = draftSchema.parse(req.body);
  const account = await ownAccount(auth, input.accountId);
  if (input.sourceMessageId) {
    const source = await query("SELECT 1 FROM mail_messages m JOIN mail_threads t ON t.id = m.thread_id WHERE m.id = $1 AND t.user_id = $2", [input.sourceMessageId, auth.userId]);
    if (!source.rowCount) throw new ApiError(404, "MAIL_NOT_FOUND", "Message not found");
  }
  const forwarded = input.forwardAttachmentIds.length
    ? (await query<{ id: string; filename: string; content_type: string; size: number }>(
      `SELECT a.id, a.filename, a.content_type, a.size FROM mail_attachments a JOIN mail_messages m ON m.id = a.message_id JOIN mail_threads t ON t.id = m.thread_id
       WHERE a.id = ANY($1::uuid[]) AND t.user_id = $2 AND m.account_id = $3`, [input.forwardAttachmentIds, auth.userId, account.id])).rows
    : [];
  const links = await assertLinkTargets(auth, input.clientId, input.dealId);
  const created = await query(
    `INSERT INTO mail_drafts (account_id, user_id, mode, source_message_id, to_addresses, cc_addresses, bcc_addresses, subject, html, attachments, client_id, deal_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [account.id, auth.userId, input.mode, input.sourceMessageId ?? null, JSON.stringify(input.to), JSON.stringify(input.cc), JSON.stringify(input.bcc),
      input.subject, input.html, JSON.stringify(forwarded.map((item) => ({ id: item.id, filename: item.filename, contentType: item.content_type, size: item.size, forwardedId: item.id }))),
      links.clientId, links.dealId]
  );
  res.status(201).json({ data: (await query(`SELECT ${draftColumns} FROM mail_drafts d WHERE d.id = $1`, [created.rows[0]!.id])).rows[0] });
}));

mailRouter.patch("/drafts/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const draft = await ownDraft(auth, String(req.params.id));
  const input = draftPatchSchema.parse(req.body);
  if (input.accountId) await ownAccount(auth, input.accountId);
  const links = input.clientId !== undefined || input.dealId !== undefined
    ? await assertLinkTargets(auth, input.clientId ?? draft.client_id, input.dealId === undefined ? draft.deal_id : input.dealId)
    : { clientId: draft.client_id, dealId: draft.deal_id };
  await query(
    `UPDATE mail_drafts SET account_id = coalesce($2, account_id), to_addresses = coalesce($3, to_addresses), cc_addresses = coalesce($4, cc_addresses),
       bcc_addresses = coalesce($5, bcc_addresses), subject = coalesce($6, subject), html = coalesce($7, html), client_id = $8, deal_id = $9, updated_at = now()
     WHERE id = $1`,
    [draft.id, input.accountId ?? null, input.to ? JSON.stringify(input.to) : null, input.cc ? JSON.stringify(input.cc) : null,
      input.bcc ? JSON.stringify(input.bcc) : null, input.subject ?? null, input.html ?? null, links.clientId, links.dealId]
  );
  res.json({ data: (await query(`SELECT ${draftColumns} FROM mail_drafts d WHERE d.id = $1`, [draft.id])).rows[0] });
}));

mailRouter.delete("/drafts/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const draft = await ownDraft(auth, String(req.params.id));
  for (const item of draft.attachments) if (item.storedPath) await objectStorage.delete(item.storedPath).catch(() => undefined);
  await query("DELETE FROM mail_drafts WHERE id = $1", [draft.id]);
  res.status(204).end();
}));

mailRouter.post("/drafts/:id/attachments", upload.array("files", 10), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const draft = await ownDraft(auth, String(req.params.id));
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw new ApiError(400, "UPLOAD_ERROR", "Choose a file");
  const total = [...draft.attachments.map((item) => item.size), ...files.map((file) => file.size)].reduce((sum, size) => sum + size, 0);
  if (total > config.maxUploadBytes) throw new ApiError(400, "MAIL_ATTACHMENTS_TOO_LARGE", `Attachments may total at most ${config.MAX_UPLOAD_MB} MB`);
  const added = [];
  for (const file of files) {
    const stored = await objectStorage.put({ companyId: auth.companyId, fileName: file.originalname, body: file.buffer });
    added.push({ id: crypto.randomUUID(), filename: file.originalname.slice(0, 255), contentType: file.mimetype || "application/octet-stream", size: file.size, storedPath: stored.key });
  }
  await query("UPDATE mail_drafts SET attachments = attachments || $2::jsonb, updated_at = now() WHERE id = $1", [draft.id, JSON.stringify(added)]);
  res.status(201).json({ data: (await query(`SELECT ${draftColumns} FROM mail_drafts d WHERE d.id = $1`, [draft.id])).rows[0] });
}));

mailRouter.delete("/drafts/:id/attachments/:attachmentId", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const draft = await ownDraft(auth, String(req.params.id));
  const removed = draft.attachments.find((item) => item.id === req.params.attachmentId);
  if (removed?.storedPath) await objectStorage.delete(removed.storedPath).catch(() => undefined);
  await query("UPDATE mail_drafts SET attachments = $2::jsonb, updated_at = now() WHERE id = $1",
    [draft.id, JSON.stringify(draft.attachments.filter((item) => item.id !== req.params.attachmentId))]);
  res.status(204).end();
}));

/** Continues a draft saved on the mail server (for example by another mail app) as an Atlas draft. */
mailRouter.post("/drafts/from-message/:messageId", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const message = await query<{ account_id: string; to_addresses: unknown; cc_addresses: unknown; bcc_addresses: unknown; subject: string; html_body: string | null; text_body: string | null }>(
    `SELECT m.account_id, m.to_addresses, m.cc_addresses, m.bcc_addresses, m.subject, m.html_body, m.text_body
     FROM mail_messages m JOIN mail_threads t ON t.id = m.thread_id WHERE m.id = $1 AND t.user_id = $2 AND m.account_id IS NOT NULL`,
    [idSchema.parse(req.params.messageId), auth.userId]
  );
  const row = message.rows[0];
  if (!row) throw new ApiError(404, "MAIL_NOT_FOUND", "Message not found");
  const html = row.html_body ?? (row.text_body ?? "").split("\n").map((line) => `<p>${line.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]!)}</p>`).join("");
  const created = await query<{ id: string }>(
    `INSERT INTO mail_drafts (account_id, user_id, to_addresses, cc_addresses, bcc_addresses, subject, html) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [row.account_id, auth.userId, JSON.stringify(row.to_addresses), JSON.stringify(row.cc_addresses), JSON.stringify(row.bcc_addresses), row.subject, html]
  );
  res.status(201).json({ data: (await query(`SELECT ${draftColumns} FROM mail_drafts d WHERE d.id = $1`, [created.rows[0]!.id])).rows[0] });
}));

mailRouter.post("/send", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const { draftId } = z.object({ draftId: z.string().uuid() }).parse(req.body);
  const draft = await ownDraft(auth, draftId);
  const account = await ownAccount(auth, draft.account_id);
  if (isDemoSecret(account.secret)) throw new ApiError(409, "MAIL_ACCOUNT_UNAVAILABLE", "The demo mailbox can't send mail");
  const recipients = draft.to_addresses.length + draft.cc_addresses.length + draft.bcc_addresses.length;
  const metadata = { accountId: account.id, recipientCount: recipients, clientId: draft.client_id, dealId: draft.deal_id };
  try {
    const sent = await sendDraft(account, draft);
    const thread = await query<{ client_id: string | null; deal_id: string | null }>("SELECT client_id, deal_id FROM mail_threads WHERE id = $1", [sent.threadId]);
    await writeAudit(req, { auth, action: "MAIL_SENT", entityType: "mail_thread", entityId: sent.threadId, metadata: { ...metadata, clientId: thread.rows[0]?.client_id ?? null, dealId: thread.rows[0]?.deal_id ?? null } });
    res.status(201).json({ data: sent });
  } catch (error) {
    if (error instanceof ApiError && error.code === "MAIL_SEND_FAILED") await writeAudit(req, { auth, action: "MAIL_SEND_FAILED", entityType: "mail_account", entityId: account.id, metadata });
    throw error;
  }
}));

mailRouter.patch("/threads/:id/link", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const thread = await ownThread(auth, String(req.params.id));
  const input = z.object({ clientId: z.string().uuid().nullable().optional(), dealId: z.string().uuid().nullable().optional() }).parse(req.body);
  const before = { clientId: (thread.client as { id: string } | null)?.id ?? null, dealId: (thread.deal as { id: string } | null)?.id ?? null };
  if (!input.clientId && !input.dealId) {
    await query("UPDATE mail_threads SET client_id = NULL, deal_id = NULL, link_source = NULL, autolink_blocked = true, link_suggestions = '{}' WHERE id = $1", [thread.id]);
    await writeAudit(req, { auth, action: "MAIL_THREAD_UNLINKED", entityType: "mail_thread", entityId: thread.id, metadata: { ...before, source: "MANUAL" } });
  } else {
    const links = await assertLinkTargets(auth, input.clientId, input.dealId);
    await query("UPDATE mail_threads SET client_id = $2, deal_id = $3, link_source = 'MANUAL', link_suggestions = '{}' WHERE id = $1", [thread.id, links.clientId, links.dealId]);
    await writeAudit(req, { auth, action: "MAIL_THREAD_LINKED", entityType: "mail_thread", entityId: thread.id, metadata: { ...links, source: "MANUAL" } });
  }
  res.json({ data: await ownThread(auth, thread.id).then(({ link_suggestions: _s, account_id: _a, ...rest }) => rest) });
}));

mailRouter.post("/threads/:id/client", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const thread = await ownThread(auth, String(req.params.id));
  const clientId = await createClient(req, auth, req.body);
  await query("UPDATE mail_threads SET client_id = $2, link_source = 'MANUAL', link_suggestions = '{}' WHERE id = $1", [thread.id, clientId]);
  await writeAudit(req, { auth, action: "MAIL_THREAD_LINKED", entityType: "mail_thread", entityId: thread.id, metadata: { clientId, dealId: null, source: "MANUAL", created: "client" } });
  res.status(201).json({ data: { clientId } });
}));

mailRouter.post("/threads/:id/deal", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const thread = await ownThread(auth, String(req.params.id));
  const body = (req.body ?? {}) as Record<string, unknown>;
  const clientId = (body.clientId as string | undefined) ?? (thread.client as { id: string } | null)?.id;
  if (!clientId) throw new ApiError(400, "CLIENT_REQUIRED", "Link the conversation to a client first");
  const dealId = await createDeal(req, auth, { title: thread.subject || "Новая сделка", ...body, clientId });
  await query("UPDATE mail_threads SET client_id = $2, deal_id = $3, link_source = 'MANUAL', link_suggestions = '{}' WHERE id = $1", [thread.id, clientId, dealId]);
  await writeAudit(req, { auth, action: "MAIL_THREAD_LINKED", entityType: "mail_thread", entityId: thread.id, metadata: { clientId, dealId, source: "MANUAL", created: "deal" } });
  res.status(201).json({ data: { clientId, dealId } });
}));

mailRouter.get("/suggest", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const { q } = z.object({ q: z.string().trim().min(1).max(100) }).parse(req.query);
  const scope = recordScope(auth, { company: "c.company_id", department: "c.department_id", owner: "c.owner_id" }, 2);
  const pattern = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  const clients = await query<{ address: string; name: string }>(
    `SELECT lower(c.email) AS address, c.name FROM clients c WHERE c.email IS NOT NULL AND (c.email ILIKE $1 OR c.name ILIKE $1 OR c.company_name ILIKE $1) AND ${scope.sql}
     ORDER BY c.updated_at DESC LIMIT 8`,
    [pattern, ...scope.values]
  );
  const past = await query<{ address: string; name: string | null }>(
    `SELECT DISTINCT ON (lower(m.from_address)) lower(m.from_address) AS address, m.from_name AS name
     FROM mail_messages m JOIN mail_threads t ON t.id = m.thread_id
     WHERE t.user_id = $1 AND lower(m.from_address) <> lower(t.mailbox_email) AND (m.from_address ILIKE $2 OR m.from_name ILIKE $2)
     ORDER BY lower(m.from_address), m.sent_at DESC LIMIT 8`,
    [auth.userId, pattern]
  );
  const seen = new Set<string>();
  const merged = [...clients.rows.map((row) => ({ ...row, source: "client" })), ...past.rows.map((row) => ({ ...row, source: "mail" }))]
    .filter((row) => !seen.has(row.address) && seen.add(row.address)).slice(0, 10);
  res.json({ data: merged });
}));

mailRouter.get("/unread", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const result = await query<{ unread: number }>(
    `SELECT coalesce(sum(f.unread), 0)::int AS unread FROM mail_folders f JOIN mail_accounts a ON a.id = f.account_id
     WHERE a.user_id = $1 AND f.special_use = 'INBOX'`,
    [auth.userId]
  );
  res.json({ data: { unread: result.rows[0]?.unread ?? 0 } });
}));
