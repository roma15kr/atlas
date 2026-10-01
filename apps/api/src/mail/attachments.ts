import { simpleParser, type Attachment, type ParsedMail } from "mailparser";
import type { Readable } from "node:stream";
import { query } from "../db";
import { ApiError } from "../errors";
import { objectStorage } from "../storage";
import { loadAccount } from "./sync";
import { isDemoSecret, openImap } from "./transport";

const INLINE_IMAGE_MAX_BYTES = 512 * 1024;

/** The attachments Atlas lists for a message: small inline images are folded into the HTML instead. */
export const listedAttachments = (parsed: ParsedMail): Attachment[] =>
  parsed.attachments.filter((item) => !(item.related && item.cid && item.size <= INLINE_IMAGE_MAX_BYTES && item.contentType.startsWith("image/")));

interface AttachmentRow {
  id: string; message_id: string; part_id: string | null; filename: string; content_type: string; size: number; stored_path: string | null;
  folder_path: string | null; uid: string | null; account_id: string | null; company_id: string;
}

async function loadAttachment(id: string): Promise<AttachmentRow> {
  const result = await query<AttachmentRow>(
    `SELECT a.id, a.message_id, a.part_id, a.filename, a.content_type, a.size, a.stored_path, f.path AS folder_path, m.uid::text,
            m.account_id, t.company_id
     FROM mail_attachments a JOIN mail_messages m ON m.id = a.message_id JOIN mail_threads t ON t.id = m.thread_id
     LEFT JOIN mail_folders f ON f.id = m.folder_id WHERE a.id = $1`,
    [id]
  );
  if (!result.rows[0]) throw new ApiError(404, "MAIL_NOT_FOUND", "Attachment not found");
  return result.rows[0];
}

/** Saves already-parsed attachment bodies (outgoing mail) so they never need a server round trip. */
export async function storeParsedAttachments(messageId: string, companyId: string, parsed: ParsedMail): Promise<void> {
  const rows = await query<{ id: string; part_id: string }>("SELECT id, part_id FROM mail_attachments WHERE message_id = $1", [messageId]);
  const listed = listedAttachments(parsed);
  for (const row of rows.rows) {
    const item = listed[Number(row.part_id)];
    if (!item) continue;
    const stored = await objectStorage.put({ companyId, fileName: item.filename ?? "attachment", body: item.content });
    await query("UPDATE mail_attachments SET stored_path = $2 WHERE id = $1", [row.id, stored.key]);
  }
}

/** Downloads an attachment from the mail server on first use and caches it in storage. */
async function fetchAndCache(row: AttachmentRow): Promise<string> {
  if (row.stored_path) return row.stored_path;
  if (!row.account_id || !row.folder_path || !row.uid) throw new ApiError(410, "MAIL_ATTACHMENT_UNAVAILABLE", "This attachment is no longer available on the mail server");
  const account = await loadAccount(row.account_id);
  if (!account || isDemoSecret(account.secret)) throw new ApiError(410, "MAIL_ATTACHMENT_UNAVAILABLE", "This attachment is no longer available on the mail server");
  const client = await openImap(account);
  try {
    const lock = await client.getMailboxLock(row.folder_path, { readOnly: true });
    try {
      const message = await client.fetchOne(row.uid, { source: true }, { uid: true });
      if (!message || !message.source) throw new ApiError(410, "MAIL_ATTACHMENT_UNAVAILABLE", "This attachment is no longer available on the mail server");
      const parsed = await simpleParser(message.source);
      const item = listedAttachments(parsed)[Number(row.part_id)];
      if (!item) throw new ApiError(410, "MAIL_ATTACHMENT_UNAVAILABLE", "This attachment is no longer available on the mail server");
      const stored = await objectStorage.put({ companyId: row.company_id, fileName: row.filename, body: item.content });
      await query("UPDATE mail_attachments SET stored_path = $2 WHERE id = $1", [row.id, stored.key]);
      return stored.key;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
}

export async function attachmentStream(id: string): Promise<{ stream: Readable; filename: string; contentType: string; size: number }> {
  const row = await loadAttachment(id);
  const key = await fetchAndCache(row);
  return { stream: await objectStorage.get(key), filename: row.filename, contentType: row.content_type, size: row.size };
}

/** Attachment bytes for forwarding; the attachment must belong to the sending mailbox. */
export async function readStored(key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of await objectStorage.get(key)) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  return Buffer.concat(chunks);
}

export async function attachmentContent(id: string, accountId: string): Promise<{ filename: string; contentType: string; content: Buffer }> {
  const row = await loadAttachment(id);
  if (row.account_id !== accountId) throw new ApiError(404, "MAIL_NOT_FOUND", "Attachment not found");
  return { filename: row.filename, contentType: row.content_type, content: await readStored(await fetchAndCache(row)) };
}

/** Caches every attachment of linked threads before a mailbox is disconnected, so client history keeps them. */
export async function cacheLinkedAttachments(accountId: string): Promise<void> {
  const rows = await query<{ id: string }>(
    `SELECT a.id FROM mail_attachments a JOIN mail_messages m ON m.id = a.message_id JOIN mail_threads t ON t.id = m.thread_id
     WHERE m.account_id = $1 AND a.stored_path IS NULL AND (t.client_id IS NOT NULL OR t.deal_id IS NOT NULL) LIMIT 200`,
    [accountId]
  );
  for (const row of rows.rows) await fetchAndCache(await loadAttachment(row.id)).catch(() => undefined);
}
