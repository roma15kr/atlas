import { createHash } from "node:crypto";
import { writeSystemAudit } from "../audit";
import { query } from "../db";
import { emitToUsers } from "../realtime";
import { objectStorage } from "../storage";
import { bot, BOT_DOWNLOAD_LIMIT, TelegramApiError, type TelegramFileRef, type TelegramMessage, type TelegramUpdate, type TelegramUser } from "./botApi";

export type MessageKind = "TEXT" | "PHOTO" | "DOCUMENT" | "VOICE" | "AUDIO" | "VIDEO" | "VIDEO_NOTE" | "STICKER" | "LOCATION" | "CONTACT" | "OTHER";

export interface ContactRow {
  id: string; company_id: string; telegram_user_id: string; client_id: string | null; responsible_id: string | null; department_id: string | null;
  status: "ACTIVE" | "BLOCKED" | "UNVERIFIED"; greeted_at: Date | null;
}

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

/** What a message contains: its kind, text or caption, a readable summary, and the file to download. */
export function describeMessage(message: TelegramMessage): { kind: MessageKind; text: string | null; summary: string | null; file: (TelegramFileRef & { name: string; mime: string }) | null } {
  const text = message.text ?? message.caption ?? null;
  const file = (ref: TelegramFileRef | undefined, name: string, mime: string) => ref ? { ...ref, name: ref.file_name ?? name, mime: ref.mime_type ?? mime } : null;
  if (message.photo?.length) return { kind: "PHOTO", text, summary: "Фото", file: file(message.photo.at(-1), "photo.jpg", "image/jpeg") };
  if (message.document) return { kind: "DOCUMENT", text, summary: `Файл: ${message.document.file_name ?? "документ"}`, file: file(message.document, "document", "application/octet-stream") };
  if (message.voice) return { kind: "VOICE", text, summary: "Голосовое сообщение", file: file(message.voice, "voice.ogg", "audio/ogg") };
  if (message.audio) return { kind: "AUDIO", text, summary: "Аудио", file: file(message.audio, "audio.mp3", "audio/mpeg") };
  if (message.video) return { kind: "VIDEO", text, summary: "Видео", file: file(message.video, "video.mp4", "video/mp4") };
  if (message.video_note) return { kind: "VIDEO_NOTE", text, summary: "Видеосообщение", file: file(message.video_note, "video-note.mp4", "video/mp4") };
  if (message.sticker) return { kind: "STICKER", text: null, summary: `Стикер ${message.sticker.emoji ?? ""}`.trim(), file: null };
  if (message.location) return { kind: "LOCATION", text: null, summary: `Геопозиция: ${message.location.latitude.toFixed(5)}, ${message.location.longitude.toFixed(5)}`, file: null };
  if (message.contact) {
    const name = [message.contact.first_name, message.contact.last_name].filter(Boolean).join(" ");
    return { kind: "CONTACT", text: null, summary: `Контакт: ${name ? `${name}, ` : ""}${message.contact.phone_number}`, file: null };
  }
  if (text !== null) return { kind: "TEXT", text, summary: null, file: null };
  return { kind: "OTHER", text: null, summary: "Сообщение этого типа не поддерживается", file: null };
}

/** Users who can see a contact: the responsible user, heads of their department (or every head for an unassigned contact), and directors. */
export async function contactAudience(contact: Pick<ContactRow, "company_id" | "responsible_id" | "department_id">): Promise<string[]> {
  const result = await query<{ id: string }>(
    `SELECT id FROM users WHERE company_id = $1 AND status = 'ACTIVE' AND (
       role = 'DIRECTOR' OR id = $2 OR (role = 'MANAGER' AND (($2::uuid IS NULL) OR department_id = $3)))`,
    [contact.company_id, contact.responsible_id, contact.department_id]
  );
  return result.rows.map((row) => row.id);
}

export async function notifyContact(contactId: string, event = "telegram:message"): Promise<void> {
  const contact = (await query<ContactRow>("SELECT * FROM telegram_contacts WHERE id = $1", [contactId])).rows[0];
  if (contact) emitToUsers(await contactAudience(contact), event, { contactId });
}

async function upsertContact(companyId: string, user: TelegramUser, reactivate: boolean): Promise<ContactRow & { created: boolean }> {
  const result = await query<ContactRow & { created: boolean }>(
    `INSERT INTO telegram_contacts (company_id, telegram_user_id, username, first_name, last_name, language_code)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (company_id, telegram_user_id) DO UPDATE SET username = EXCLUDED.username, first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name, language_code = EXCLUDED.language_code,
       status = CASE WHEN $7 THEN 'ACTIVE' ELSE telegram_contacts.status END
     RETURNING *, (xmax = 0) AS created`,
    [companyId, user.id, user.username ?? null, user.first_name ?? null, user.last_name ?? null, user.language_code ?? null, reactivate]
  );
  return result.rows[0]!;
}

async function settings(companyId: string): Promise<{ greeting_text: string; welcome_text: string; default_responsible_id: string | null }> {
  await query("INSERT INTO telegram_settings (company_id) VALUES ($1) ON CONFLICT DO NOTHING", [companyId]);
  return (await query<{ greeting_text: string; welcome_text: string; default_responsible_id: string | null }>(
    "SELECT greeting_text, welcome_text, default_responsible_id FROM telegram_settings WHERE company_id = $1", [companyId]
  )).rows[0]!;
}

/** Sends a text from the bot itself (greeting, welcome) and records it in the conversation. */
async function sendBotText(contact: ContactRow, text: string): Promise<void> {
  try {
    const sent = await bot.sendMessage(Number(contact.telegram_user_id), text);
    await query("INSERT INTO telegram_messages (contact_id, direction, telegram_message_id, text, status) VALUES ($1, 'OUT', $2, $3, 'SENT') ON CONFLICT DO NOTHING",
      [contact.id, sent.message_id, text]);
  } catch (error) {
    if (error instanceof TelegramApiError && error.blocked) await query("UPDATE telegram_contacts SET status = 'BLOCKED' WHERE id = $1", [contact.id]);
    else throw error;
  }
}

/** The invite's creator when they may handle that client (a director, or the client's department), otherwise the client's owner. */
async function responsibleForInvite(createdBy: string | null, clientId: string): Promise<string | null> {
  const result = await query<{ responsible: string | null }>(
    `SELECT CASE WHEN u.id IS NOT NULL AND u.status = 'ACTIVE' AND (u.role = 'DIRECTOR' OR u.department_id IS NOT DISTINCT FROM c.department_id)
                 THEN u.id ELSE c.owner_id END AS responsible
     FROM clients c LEFT JOIN users u ON u.id = $1 WHERE c.id = $2`,
    [createdBy, clientId]
  );
  return result.rows[0]?.responsible ?? null;
}

/** `/start <token>`: binds the contact to the invite's client unless it already belongs to another client. */
async function acceptInvite(contact: ContactRow, token: string): Promise<boolean> {
  const invite = (await query<{ id: string; client_id: string; created_by: string | null }>(
    "SELECT id, client_id, created_by FROM telegram_invites WHERE token_hash = $1 AND company_id = $2 AND used_at IS NULL AND expires_at > now()",
    [hashToken(token), contact.company_id]
  )).rows[0];
  if (!invite) return false;
  if (contact.client_id && contact.client_id !== invite.client_id) {
    await query("UPDATE telegram_invites SET conflict_client_id = $2 WHERE id = $1", [invite.id, contact.client_id]);
    return false;
  }
  const responsible = await responsibleForInvite(invite.created_by, invite.client_id);
  await query("UPDATE telegram_contacts SET client_id = $2, responsible_id = $3, bound_via = 'INVITE', greeted_at = coalesce(greeted_at, now()) WHERE id = $1",
    [contact.id, invite.client_id, responsible]);
  await query("UPDATE telegram_invites SET used_at = now(), used_by_contact = $2 WHERE id = $1", [invite.id, contact.id]);
  const creator = invite.created_by ? (await query<{ id: string; company_id: string; department_id: string | null; role: "DIRECTOR" | "MANAGER" | "EMPLOYEE" }>(
    "SELECT id, company_id, department_id, role FROM users WHERE id = $1", [invite.created_by])).rows[0] : undefined;
  await writeSystemAudit({
    auth: creator ? { userId: creator.id, companyId: creator.company_id, departmentId: creator.department_id, username: "", role: creator.role } : null,
    action: "TELEGRAM_CONTACT_BOUND", entityType: "telegram_contact", entityId: contact.id, departmentId: creator?.department_id ?? null,
    metadata: { contactId: contact.id, clientId: invite.client_id, source: "INVITE" }
  });
  const updated = (await query<ContactRow>("SELECT * FROM telegram_contacts WHERE id = $1", [contact.id])).rows[0]!;
  await sendBotText(updated, (await settings(contact.company_id)).welcome_text);
  return true;
}

async function onMessage(companyId: string, message: TelegramMessage): Promise<void> {
  if (message.chat.type !== "private" || !message.from || message.from.is_bot) return;
  let contact = await upsertContact(companyId, message.from, true);
  const start = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{16,64}))?\s*$/.exec(message.text ?? "");
  let invited = false;
  if (start?.[1]) invited = await acceptInvite(contact, start[1]);
  contact = (await query<ContactRow & { created: boolean }>("SELECT *, false AS created FROM telegram_contacts WHERE id = $1", [contact.id])).rows[0]!;

  const content = describeMessage(message);
  const tooLarge = Boolean(content.file && (content.file.file_size ?? 0) > BOT_DOWNLOAD_LIMIT);
  const stored = await query<{ id: string }>(
    `INSERT INTO telegram_messages (contact_id, direction, telegram_message_id, text, kind, file_id, file_name, mime_type, file_size, file_too_large, summary, status, created_at)
     VALUES ($1, 'IN', $2, $3, $4, $5, $6, $7, $8, $9, $10, 'RECEIVED', to_timestamp($11)) ON CONFLICT DO NOTHING RETURNING id`,
    [contact.id, message.message_id, start ? "Клиент начал диалог с ботом" : content.text, content.kind, content.file?.file_id ?? null, content.file?.name ?? null,
      content.file?.mime ?? null, content.file?.file_size ?? null, tooLarge, start ? null : content.summary, message.date]
  );
  await query("UPDATE telegram_contacts SET last_message_at = greatest(coalesce(last_message_at, to_timestamp($2)), to_timestamp($2)) WHERE id = $1", [contact.id, message.date]);

  if (!contact.client_id && !contact.responsible_id) {
    const { default_responsible_id: fallback, greeting_text: greeting } = await settings(companyId);
    if (fallback) await query("UPDATE telegram_contacts SET responsible_id = $2, bound_via = 'DEFAULT' WHERE id = $1 AND responsible_id IS NULL", [contact.id, fallback]);
    if (!contact.greeted_at && !invited) {
      await query("UPDATE telegram_contacts SET greeted_at = now() WHERE id = $1", [contact.id]);
      await sendBotText(contact, greeting);
    }
  }
  await notifyContact(contact.id);
  const messageId = stored.rows[0]?.id;
  if (messageId && content.file && !tooLarge) void downloadMedia(messageId).catch(() => undefined);
}

async function onEdit(companyId: string, message: TelegramMessage): Promise<void> {
  if (message.chat.type !== "private" || !message.from) return;
  const updated = await query<{ contact_id: string }>(
    `UPDATE telegram_messages m SET text = $3, edited_at = to_timestamp($4) FROM telegram_contacts c
     WHERE c.id = m.contact_id AND c.company_id = $1 AND c.telegram_user_id = $2 AND m.direction = 'IN' AND m.telegram_message_id = $5
     RETURNING m.contact_id`,
    [companyId, message.from.id, message.text ?? message.caption ?? null, message.edit_date ?? message.date, message.message_id]
  );
  if (updated.rows[0]) await notifyContact(updated.rows[0].contact_id);
}

async function onMembership(companyId: string, update: NonNullable<TelegramUpdate["my_chat_member"]>): Promise<void> {
  if (update.chat.type !== "private") return;
  const status = update.new_chat_member.status;
  if (status !== "kicked" && status !== "member") return;
  const contact = await upsertContact(companyId, update.from, false);
  // "member" means the customer (re)started the bot, so they can be messaged again, imported ones included.
  await query("UPDATE telegram_contacts SET status = $2 WHERE id = $1", [contact.id, status === "kicked" ? "BLOCKED" : "ACTIVE"]);
  await notifyContact(contact.id, "telegram:contact");
}

export async function handleUpdate(companyId: string, update: TelegramUpdate): Promise<void> {
  if (update.message) await onMessage(companyId, update.message);
  else if (update.edited_message) await onEdit(companyId, update.edited_message);
  else if (update.my_chat_member) await onMembership(companyId, update.my_chat_member);
}

/** Stores an update once (duplicates are ignored) and returns whether it was new. */
export async function storeUpdate(companyId: string, update: TelegramUpdate): Promise<boolean> {
  const inserted = await query("INSERT INTO telegram_updates (update_id, company_id, payload) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [update.update_id, companyId, JSON.stringify(update)]);
  if (inserted.rowCount) await query("UPDATE telegram_settings SET last_update_at = now() WHERE company_id = $1", [companyId]);
  return Boolean(inserted.rowCount);
}

/** Processes a stored update; failures are counted and retried by the sweeper. */
export async function processUpdate(updateId: number): Promise<void> {
  const row = (await query<{ company_id: string; payload: TelegramUpdate }>("SELECT company_id, payload FROM telegram_updates WHERE update_id = $1 AND processed_at IS NULL", [updateId])).rows[0];
  if (!row) return;
  try {
    await handleUpdate(row.company_id, row.payload);
    await query("UPDATE telegram_updates SET processed_at = now(), error = NULL WHERE update_id = $1", [updateId]);
  } catch (error) {
    await query("UPDATE telegram_updates SET attempts = attempts + 1, error = $2 WHERE update_id = $1", [updateId, error instanceof Error ? error.message.slice(0, 500) : "failed"]);
    throw error;
  }
}

/** Downloads an incoming file into storage; the message is already visible and the file follows. */
export async function downloadMedia(messageId: string): Promise<void> {
  const row = (await query<{ file_id: string | null; file_name: string | null; stored_path: string | null; file_too_large: boolean; contact_id: string; company_id: string }>(
    "SELECT m.file_id, m.file_name, m.stored_path, m.file_too_large, m.contact_id, c.company_id FROM telegram_messages m JOIN telegram_contacts c ON c.id = m.contact_id WHERE m.id = $1",
    [messageId]
  )).rows[0];
  if (!row?.file_id || row.stored_path || row.file_too_large) return;
  const file = await bot.getFile(row.file_id);
  if (!file.file_path) { await query("UPDATE telegram_messages SET file_too_large = true WHERE id = $1", [messageId]); return; }
  const stored = await objectStorage.put({ companyId: row.company_id, fileName: row.file_name ?? "file", body: await bot.downloadFile(file.file_path) });
  await query("UPDATE telegram_messages SET stored_path = $2 WHERE id = $1", [messageId, stored.key]);
  await notifyContact(row.contact_id);
}
