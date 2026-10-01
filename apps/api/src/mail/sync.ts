import type { ImapFlow, ListResponse } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import { authForUser, type TargetUser } from "../access";
import { writeSystemAudit } from "../audit";
import { config } from "../config";
import { query } from "../db";
import { emitToUsers } from "../realtime";
import { recordScope } from "../scope";
import { listedAttachments, storeParsedAttachments } from "./attachments";
import { sanitizeMailHtml, snippetOf } from "./sanitize";
import { normalizeSubject, parseMessageIds, participantsOf, type Address } from "./threading";
import { failureReason, forgetAccessToken, isDemoSecret, openImap, reasonText, type MailAccountRow } from "./transport";

export type SpecialUse = "INBOX" | "SENT" | "DRAFTS" | "ARCHIVE" | "JUNK" | "TRASH" | "ALL";

const SPECIAL: Record<string, SpecialUse> = {
  "\\Inbox": "INBOX", "\\Sent": "SENT", "\\Drafts": "DRAFTS", "\\Archive": "ARCHIVE", "\\Junk": "JUNK", "\\Trash": "TRASH", "\\All": "ALL"
};
export const SPECIAL_NAMES: Record<SpecialUse, string> = {
  INBOX: "Входящие", SENT: "Отправленные", DRAFTS: "Черновики", ARCHIVE: "Архив", JUNK: "Спам", TRASH: "Корзина", ALL: "Вся почта"
};
/** Folders that are listed but never synced: Gmail's All Mail and Starred only duplicate other folders. */
const SKIP_SYNC = new Set(["\\All", "\\Flagged", "\\Important"]);
const OTHER_FOLDERS_EVERY_MS = 10 * 60_000;
const MAX_FULL_MESSAGE_BYTES = 30 * 1024 * 1024;
const INLINE_IMAGE_MAX_BYTES = 512 * 1024;

export function specialUseOf(folder: Pick<ListResponse, "path" | "specialUse">): SpecialUse | null {
  if (folder.path.toUpperCase() === "INBOX") return "INBOX";
  return folder.specialUse ? SPECIAL[folder.specialUse] ?? null : null;
}

export interface SyncResult { newMessages: number; folders: number }

interface FolderRow { id: string; path: string; special_use: SpecialUse | null; uidvalidity: string | null; last_uid: string; highest_modseq: string | null; synced_at: Date | null }

const addresses = (value: AddressObject | AddressObject[] | undefined): Address[] =>
  (Array.isArray(value) ? value : value ? [value] : []).flatMap((group) => group.value).filter((item) => item.address).map((item) => ({ address: item.address!.toLowerCase(), name: item.name || undefined }));

/** Inline `cid:` images up to 512 KB become data URIs so the sandboxed viewer can show them without a request. */
function inlineImages(html: string, parsed: ParsedMail): string {
  let result = html;
  for (const attachment of parsed.attachments) {
    if (!attachment.cid || !attachment.contentType.startsWith("image/") || attachment.size > INLINE_IMAGE_MAX_BYTES) continue;
    const uri = `data:${attachment.contentType};base64,${attachment.content.toString("base64")}`;
    result = result.split(`cid:${attachment.cid}`).join(uri);
  }
  return result;
}

export interface IngestInput {
  account: Pick<MailAccountRow, "id" | "company_id" | "user_id" | "email">;
  folderId: string | null;
  uid: number | null;
  flags: Set<string>;
  size: number;
  providerThreadId?: string | null;
  parsed: ParsedMail;
}

/** Finds the thread for a message: provider thread id, then references, then subject and a shared correspondent within 30 days. */
async function resolveThread(input: IngestInput, sentAt: Date, participants: string[], subjectKey: string, messageId: string | null, references: string[]): Promise<string | null> {
  const { account } = input;
  if (input.providerThreadId) {
    const found = await query<{ id: string }>("SELECT id FROM mail_threads WHERE account_id = $1 AND provider_thread_id = $2", [account.id, input.providerThreadId]);
    if (found.rows[0]) return found.rows[0].id;
  }
  const ids = [...new Set([...(messageId ? [messageId] : []), ...references])];
  if (ids.length) {
    const found = await query<{ thread_id: string }>(
      "SELECT thread_id FROM mail_messages WHERE account_id = $1 AND message_id_header = ANY($2::text[]) ORDER BY sent_at LIMIT 1",
      [account.id, ids]
    );
    if (found.rows[0]) return found.rows[0].thread_id;
  }
  if (subjectKey && participants.length) {
    const found = await query<{ id: string }>(
      `SELECT id FROM mail_threads WHERE account_id = $1 AND subject_key = $2 AND participants && $3::text[]
         AND last_message_at > $4::timestamptz - interval '30 days' AND last_message_at < $4::timestamptz + interval '30 days'
       ORDER BY last_message_at DESC LIMIT 1`,
      [account.id, subjectKey, participants, sentAt]
    );
    if (found.rows[0]) return found.rows[0].id;
  }
  return null;
}

/** Stores one parsed message (or completes a local sent copy) and returns its thread id. */
export async function ingestMessage(input: IngestInput): Promise<{ threadId: string; created: boolean; messageId: string | null }> {
  const { account, parsed } = input;
  const from = addresses(parsed.from)[0] ?? { address: "" };
  const to = addresses(parsed.to), cc = addresses(parsed.cc), bcc = addresses(parsed.bcc), replyTo = addresses(parsed.replyTo);
  const messageId = parsed.messageId ? parseMessageIds(parsed.messageId)[0] ?? parsed.messageId : null;
  const inReplyTo = parseMessageIds(parsed.inReplyTo)[0] ?? null;
  const references = [...new Set([...parseMessageIds(parsed.references), ...(inReplyTo ? [inReplyTo] : [])])];
  const subject = parsed.subject ?? "";
  const sentAt = parsed.date ?? new Date();
  const participants = participantsOf(account.email, [from], to, cc, bcc);
  const sanitized = parsed.html ? sanitizeMailHtml(inlineImages(parsed.html, parsed)) : { html: null, hasRemoteImages: false };
  const text = parsed.text ?? null;
  const attachments = listedAttachments(parsed);

  // A message Atlas sent (or a moved message) already has a local row without a folder uid: complete it instead of duplicating.
  if (messageId) {
    const local = await query<{ id: string; thread_id: string }>(
      `SELECT id, thread_id FROM mail_messages WHERE account_id = $1 AND message_id_header = $2
         AND (folder_id IS NULL OR (folder_id = $3 AND uid IS NULL)) LIMIT 1`,
      [account.id, messageId, input.folderId]
    );
    if (local.rows[0]) {
      await query("UPDATE mail_messages SET folder_id = $2, uid = $3, seen = $4, flagged = $5, answered = $6 WHERE id = $1",
        [local.rows[0].id, input.folderId, input.uid, input.flags.has("\\Seen"), input.flags.has("\\Flagged"), input.flags.has("\\Answered")]);
      return { threadId: local.rows[0].thread_id, created: false, messageId: local.rows[0].id };
    }
  }

  const subjectKey = normalizeSubject(subject);
  let threadId = await resolveThread(input, sentAt, participants, subjectKey, messageId, references);
  if (!threadId) {
    const created = await query<{ id: string }>(
      `INSERT INTO mail_threads (company_id, user_id, account_id, mailbox_email, subject, subject_key, participants, provider_thread_id, last_message_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [account.company_id, account.user_id, account.id, account.email, subject, subjectKey, participants, input.providerThreadId ?? null, sentAt]
    );
    threadId = created.rows[0]!.id;
  }
  const inserted = await query<{ id: string }>(
    `INSERT INTO mail_messages (thread_id, account_id, folder_id, uid, message_id_header, in_reply_to, reference_ids, from_address, from_name,
       to_addresses, cc_addresses, bcc_addresses, reply_to, subject, snippet, text_body, html_body, has_remote_images, sent_at, seen, flagged, answered, size)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
     ON CONFLICT DO NOTHING RETURNING id`,
    [threadId, account.id, input.folderId, input.uid, messageId, inReplyTo, references, from.address, from.name ?? null,
      JSON.stringify(to), JSON.stringify(cc), JSON.stringify(bcc), JSON.stringify(replyTo), subject, snippetOf(text, sanitized.html), text,
      sanitized.html, sanitized.hasRemoteImages, sentAt, input.flags.has("\\Seen"), input.flags.has("\\Flagged"), input.flags.has("\\Answered"), input.size]
  );
  const messageRowId = inserted.rows[0]?.id;
  if (messageRowId && attachments.length) {
    const values: unknown[] = [];
    const rows = attachments.map((item, index) => {
      values.push(messageRowId, String(index), item.filename || `attachment-${index + 1}`, item.contentType || "application/octet-stream", item.size, item.cid ?? null, Boolean(item.related));
      const base = values.length - 7;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
    });
    await query(`INSERT INTO mail_attachments (message_id, part_id, filename, content_type, size, content_id, inline) VALUES ${rows.join(", ")}`, values);
    // Outgoing mail has no server copy yet; keep its attachment bodies now.
    if (input.uid === null) await storeParsedAttachments(messageRowId, account.company_id, parsed);
  }
  return { threadId, created: Boolean(messageRowId), messageId: messageRowId ?? null };
}

/** Recomputes a thread's counters from its messages; empty unlinked threads are removed. */
export async function refreshThreads(threadIds: Iterable<string>): Promise<void> {
  const ids = [...new Set(threadIds)];
  if (!ids.length) return;
  await query(
    `UPDATE mail_threads t SET
       message_count = s.count, unread_count = s.unread, last_message_at = coalesce(s.last_at, t.last_message_at),
       has_attachments = s.attachments, participants = coalesce(s.participants, t.participants)
     FROM (
       SELECT t2.id,
              count(DISTINCT coalesce(m.message_id_header, m.id::text))::int AS count,
              count(DISTINCT coalesce(m.message_id_header, m.id::text)) FILTER (WHERE NOT m.seen AND m.send_status IS NULL)::int AS unread,
              max(m.sent_at) AS last_at,
              bool_or(EXISTS (SELECT 1 FROM mail_attachments a WHERE a.message_id = m.id AND NOT a.inline)) IS TRUE AS attachments,
              (SELECT array_agg(DISTINCT p) FROM unnest(t2.participants) p) AS participants
       FROM mail_threads t2 LEFT JOIN mail_messages m ON m.thread_id = t2.id
       WHERE t2.id = ANY($1::uuid[]) GROUP BY t2.id
     ) s WHERE s.id = t.id`,
    [ids]
  );
  await query(
    `UPDATE mail_threads t SET participants = (SELECT array_agg(DISTINCT p) FROM (
        SELECT unnest(t.participants) AS p UNION
        SELECT lower(m.from_address) FROM mail_messages m WHERE m.thread_id = t.id AND lower(m.from_address) <> lower(t.mailbox_email) AND m.from_address <> ''
     ) x) WHERE t.id = ANY($1::uuid[])`,
    [ids]
  );
  await query("DELETE FROM mail_threads WHERE id = ANY($1::uuid[]) AND message_count = 0 AND client_id IS NULL AND deal_id IS NULL", [ids]);
}

/** Links unlinked threads to the one client, visible to the owner, whose email matches a correspondent. Several matches become suggestions. */
export async function autoLink(threadIds: Iterable<string>): Promise<string[]> {
  const ids = [...new Set(threadIds)];
  if (!ids.length) return [];
  const threads = await query<{ id: string; participants: string[]; user_id: string; company_id: string; department_id: string | null; role: TargetUser["role"] }>(
    `SELECT t.id, t.participants, u.id AS user_id, u.company_id, u.department_id, u.role
     FROM mail_threads t JOIN users u ON u.id = t.user_id
     WHERE t.id = ANY($1::uuid[]) AND t.client_id IS NULL AND NOT t.autolink_blocked AND cardinality(t.participants) > 0`,
    [ids]
  );
  const linked: string[] = [];
  for (const thread of threads.rows) {
    const auth = authForUser({ id: thread.user_id, company_id: thread.company_id, department_id: thread.department_id, role: thread.role });
    const scope = recordScope(auth, {}, 2);
    const matches = await query<{ id: string }>(
      `SELECT id FROM clients WHERE lower(email) = ANY($1::text[]) AND ${scope.sql} ORDER BY updated_at DESC LIMIT 5`,
      [thread.participants, ...scope.values]
    );
    if (matches.rows.length === 1) {
      const updated = await query("UPDATE mail_threads SET client_id = $2, link_source = 'AUTO', link_suggestions = '{}' WHERE id = $1 AND client_id IS NULL", [thread.id, matches.rows[0]!.id]);
      if (updated.rowCount) {
        linked.push(thread.id);
        await writeSystemAudit({ auth, action: "MAIL_THREAD_LINKED", entityType: "mail_thread", entityId: thread.id, metadata: { clientId: matches.rows[0]!.id, source: "AUTO" } });
      }
    } else if (matches.rows.length > 1) {
      await query("UPDATE mail_threads SET link_suggestions = $2 WHERE id = $1", [thread.id, matches.rows.map((row) => row.id)]);
    }
  }
  return linked;
}

async function syncFolderList(client: ImapFlow, account: MailAccountRow): Promise<FolderRow[]> {
  const listed = (await client.list()).filter((folder) => !folder.flags.has("\\Noselect") && !folder.flags.has("\\NonExistent"));
  for (const folder of listed) {
    const special = specialUseOf(folder);
    await query(
      `INSERT INTO mail_folders (account_id, path, name, special_use) VALUES ($1, $2, $3, $4)
       ON CONFLICT (account_id, path) DO UPDATE SET name = EXCLUDED.name, special_use = EXCLUDED.special_use`,
      [account.id, folder.path, special ? SPECIAL_NAMES[special] : folder.name, special]
    );
  }
  const paths = listed.map((folder) => folder.path);
  const removed = await query<{ id: string }>("DELETE FROM mail_folders WHERE account_id = $1 AND NOT (path = ANY($2::text[])) RETURNING id", [account.id, paths]);
  if (removed.rowCount) await query("DELETE FROM mail_messages WHERE account_id = $1 AND folder_id IS NULL AND send_status IS NULL AND uid IS NOT NULL", [account.id]);
  const rows = await query<FolderRow>("SELECT id, path, special_use, uidvalidity::text, last_uid::text, highest_modseq, synced_at FROM mail_folders WHERE account_id = $1", [account.id]);
  const skipped = new Set(listed.filter((folder) => folder.specialUse && SKIP_SYNC.has(folder.specialUse)).map((folder) => folder.path));
  return rows.rows.filter((row) => !skipped.has(row.path));
}

async function syncFolder(client: ImapFlow, account: MailAccountRow, folder: FolderRow, touched: Set<string>): Promise<number> {
  const lock = await client.getMailboxLock(folder.path, { readOnly: true });
  let added = 0;
  try {
    const mailbox = client.mailbox;
    if (!mailbox || typeof mailbox === "boolean") return 0;
    const uidValidity = String(mailbox.uidValidity);
    let lastUid = Number(folder.last_uid);
    if (folder.uidvalidity && folder.uidvalidity !== uidValidity) {
      const dropped = await query<{ thread_id: string }>("DELETE FROM mail_messages WHERE folder_id = $1 RETURNING thread_id", [folder.id]);
      dropped.rows.forEach((row) => touched.add(row.thread_id));
      lastUid = 0;
    }
    const since = new Date(Date.now() - config.MAIL_SYNC_DAYS * 86_400_000);
    let uids: number[] = [];
    if (mailbox.exists > 0) {
      const found = lastUid === 0
        ? await client.search({ since }, { uid: true })
        : await client.search({ uid: `${lastUid + 1}:*` }, { uid: true });
      uids = (found || []).filter((uid) => uid > lastUid).sort((a, b) => a - b);
    }
    for (const uid of uids) {
      const meta = await client.fetchOne(String(uid), { uid: true, flags: true, size: true, threadId: true, internalDate: true }, { uid: true });
      if (!meta) continue;
      const full = (meta.size ?? 0) <= MAX_FULL_MESSAGE_BYTES;
      const body = await client.fetchOne(String(uid), full ? { source: true } : { headers: true }, { uid: true });
      const source = body ? (full ? body.source : body.headers) : undefined;
      if (!source) continue;
      const parsed = await simpleParser(source, { skipTextLinks: true });
      if ((meta.size ?? 0) > MAX_FULL_MESSAGE_BYTES) parsed.text = "Письмо слишком большое для показа в Atlas — откройте его в почтовом клиенте.";
      if (!parsed.date && meta.internalDate) parsed.date = new Date(meta.internalDate);
      const result = await ingestMessage({ account, folderId: folder.id, uid, flags: meta.flags ?? new Set(), size: meta.size ?? 0, providerThreadId: meta.threadId ?? null, parsed });
      touched.add(result.threadId);
      if (result.created) added += 1;
      lastUid = Math.max(lastUid, uid);
    }

    // Reflect changes from other mail clients: flags, and messages moved or deleted on the server.
    if (mailbox.exists > 0) {
      const serverUids = new Set((await client.search({ all: true }, { uid: true })) || []);
      const local = await query<{ id: string; uid: string; thread_id: string }>("SELECT id, uid::text, thread_id FROM mail_messages WHERE folder_id = $1 AND uid IS NOT NULL", [folder.id]);
      const gone = local.rows.filter((row) => !serverUids.has(Number(row.uid)));
      if (gone.length) {
        await query("DELETE FROM mail_messages WHERE id = ANY($1::uuid[])", [gone.map((row) => row.id)]);
        gone.forEach((row) => touched.add(row.thread_id));
      }
      const known = local.rows.filter((row) => serverUids.has(Number(row.uid))).map((row) => Number(row.uid)).sort((a, b) => b - a).slice(0, 1000);
      if (known.length) {
        const changedSince = folder.highest_modseq && mailbox.highestModseq ? BigInt(folder.highest_modseq) : undefined;
        for await (const message of client.fetch(known.join(","), { uid: true, flags: true }, { uid: true, ...(changedSince ? { changedSince } : {}) })) {
          const flags = message.flags ?? new Set<string>();
          const updated = await query<{ thread_id: string }>(
            `UPDATE mail_messages SET seen = $3, flagged = $4, answered = $5 WHERE folder_id = $1 AND uid = $2
               AND (seen, flagged, answered) IS DISTINCT FROM ($3, $4, $5) RETURNING thread_id`,
            [folder.id, message.uid, flags.has("\\Seen"), flags.has("\\Flagged"), flags.has("\\Answered")]
          );
          updated.rows.forEach((row) => touched.add(row.thread_id));
        }
      }
    } else {
      const cleared = await query<{ thread_id: string }>("DELETE FROM mail_messages WHERE folder_id = $1 AND uid IS NOT NULL RETURNING thread_id", [folder.id]);
      cleared.rows.forEach((row) => touched.add(row.thread_id));
    }
    const counted = await client.status(folder.path, { messages: true, unseen: true }).catch(() => false as const);
    const status = counted || null;
    await query(
      "UPDATE mail_folders SET uidvalidity = $2, last_uid = $3, highest_modseq = $4, total = $5, unread = $6, synced_at = now() WHERE id = $1",
      [folder.id, uidValidity, lastUid, mailbox.highestModseq ? String(mailbox.highestModseq) : null, status?.messages ?? mailbox.exists, status?.unseen ?? 0]
    );
  } finally {
    lock.release();
  }
  return added;
}

/** Counts every folder cheaply, including folders not due for a full sync. */
async function refreshCounts(client: ImapFlow, folders: FolderRow[], synced: Set<string>): Promise<void> {
  for (const folder of folders) {
    if (synced.has(folder.id)) continue;
    const status = await client.status(folder.path, { messages: true, unseen: true }).catch(() => false as const);
    if (status) await query("UPDATE mail_folders SET total = $2, unread = $3 WHERE id = $1", [folder.id, status.messages ?? 0, status.unseen ?? 0]);
  }
}

export async function loadAccount(id: string): Promise<MailAccountRow | null> {
  const result = await query<MailAccountRow>("SELECT * FROM mail_accounts WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}

/**
 * Syncs one mailbox: inbox always, other folders when stale or when `full` is set. Authentication
 * failures pause the mailbox as NEEDS_ATTENTION; other failures back off without changing status.
 */
export async function syncAccount(accountId: string, options: { full?: boolean } = {}): Promise<SyncResult> {
  const account = await loadAccount(accountId);
  if (!account || account.status !== "CONNECTED" || isDemoSecret(account.secret)) return { newMessages: 0, folders: 0 };
  let client: ImapFlow | null = null;
  try {
    client = await openImap(account);
    const folders = await syncFolderList(client, account);
    const touched = new Set<string>();
    const synced = new Set<string>();
    let newMessages = 0;
    const order = [...folders].sort((a, b) => Number(b.special_use === "INBOX") - Number(a.special_use === "INBOX"));
    for (const folder of order) {
      const due = options.full || folder.special_use === "INBOX" || !folder.synced_at || Date.now() - folder.synced_at.getTime() > OTHER_FOLDERS_EVERY_MS;
      if (!due) continue;
      newMessages += await syncFolder(client, account, folder, touched);
      synced.add(folder.id);
    }
    await refreshCounts(client, folders, synced);
    await refreshThreads(touched);
    await autoLink(touched);
    await query(
      "UPDATE mail_accounts SET last_synced_at = now(), failures = 0, status_reason = NULL, next_sync_at = now() + make_interval(secs => $2) WHERE id = $1",
      [account.id, config.MAIL_POLL_SECONDS]
    );
    if (touched.size || newMessages) emitToUsers([account.user_id], "mail:changed", { accountId: account.id, newMessages });
    return { newMessages, folders: folders.length };
  } catch (error) {
    await recordFailure(account, error);
    if (error && typeof error === "object") (error as { recorded?: boolean }).recorded = true;
    throw error;
  } finally {
    await client?.logout().catch(() => client?.close());
  }
}

export async function recordFailure(account: Pick<MailAccountRow, "id" | "user_id">, error: unknown): Promise<void> {
  const reason = failureReason(error);
  if (reason === "AUTH") {
    forgetAccessToken(account.id);
    const revoked = (error as { code?: string }).code === "MAIL_OAUTH_REVOKED";
    await query("UPDATE mail_accounts SET status = 'NEEDS_ATTENTION', status_reason = $2 WHERE id = $1",
      [account.id, revoked ? "Доступ к почте отозван — подключите ящик заново" : reasonText.AUTH]);
    emitToUsers([account.user_id], "mail:account", { accountId: account.id, status: "NEEDS_ATTENTION" });
    return;
  }
  await query(
    `UPDATE mail_accounts SET failures = failures + 1, status_reason = $2,
       next_sync_at = now() + make_interval(mins => least(30, power(2, least(failures, 5))::int)) WHERE id = $1`,
    [account.id, reasonText[reason]]
  );
}
