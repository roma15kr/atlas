import MailComposer from "nodemailer/lib/mail-composer";
import { simpleParser } from "mailparser";
import { query } from "../db";
import { ApiError } from "../errors";
import { PROVIDER_SERVERS } from "./oauth";
import { ingestMessage, refreshThreads } from "./sync";
import { normalizeSubject, parseMessageIds, type Address } from "./threading";
import { accountAuth, failureReason, openImap, reasonText, smtpTransport, type MailAccountRow } from "./transport";
import { attachmentContent, readStored } from "./attachments";

export const SEND_LIMIT_PER_HOUR = 100;

export interface DraftRow {
  id: string;
  account_id: string;
  user_id: string;
  mode: "NEW" | "REPLY" | "REPLY_ALL" | "FORWARD";
  source_message_id: string | null;
  to_addresses: Address[];
  cc_addresses: Address[];
  bcc_addresses: Address[];
  subject: string;
  html: string;
  attachments: Array<{ id: string; filename: string; contentType: string; size: number; storedPath?: string; forwardedId?: string }>;
  client_id: string | null;
  deal_id: string | null;
}

const formatAddress = (item: Address) => item.name ? { name: item.name, address: item.address } : item.address;

/** Plain text alternative of the composed HTML, so recipients without HTML still read it. */
export function htmlToText(html: string): string {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d|blockquote)>/gi, "\n").replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n").trim();
}

export async function assertSendQuota(userId: string): Promise<void> {
  const sent = await query<{ count: number }>(
    `SELECT count(*)::int AS count FROM mail_messages m JOIN mail_threads t ON t.id = m.thread_id
     WHERE t.user_id = $1 AND m.send_status IS NOT NULL AND m.created_at > now() - interval '1 hour'`,
    [userId]
  );
  if ((sent.rows[0]?.count ?? 0) >= SEND_LIMIT_PER_HOUR) throw new ApiError(429, "MAIL_RATE_LIMITED", "Sending limit reached; try again later");
}

/**
 * Sends a draft: builds the MIME once, records a SENDING copy in the thread, submits over SMTP,
 * stores it in Sent for providers that don't do so themselves, then marks it SENT and deletes the
 * draft. A rejected send marks the copy FAILED and keeps the draft.
 */
export async function sendDraft(account: MailAccountRow, draft: DraftRow): Promise<{ messageId: string; threadId: string }> {
  if (account.status !== "CONNECTED") throw new ApiError(409, "MAIL_ACCOUNT_UNAVAILABLE", "Reconnect this mailbox before sending");
  if (!draft.to_addresses.length && !draft.cc_addresses.length && !draft.bcc_addresses.length) throw new ApiError(400, "MAIL_RECIPIENT_REQUIRED", "Add at least one recipient");
  await assertSendQuota(account.user_id);

  const source = draft.source_message_id
    ? (await query<{ id: string; thread_id: string; message_id_header: string | null; reference_ids: string[]; folder_id: string | null; uid: string | null }>(
      "SELECT id, thread_id, message_id_header, reference_ids, folder_id, uid::text FROM mail_messages WHERE id = $1 AND account_id = $2", [draft.source_message_id, account.id])).rows[0]
    : undefined;
  const replying = source && (draft.mode === "REPLY" || draft.mode === "REPLY_ALL");
  const signature = account.signature ? `<br><br>${account.signature.split("\n").map(escapeHtml).join("<br>")}` : "";
  const html = `${draft.html}${signature}`;

  const attachments = [];
  for (const item of draft.attachments) {
    if (item.storedPath) attachments.push({ filename: item.filename, contentType: item.contentType, content: await readStored(item.storedPath) });
    else if (item.forwardedId) {
      const forwarded = await attachmentContent(item.forwardedId, account.id);
      attachments.push({ filename: forwarded.filename, contentType: forwarded.contentType, content: forwarded.content });
    }
  }
  const references = replying ? [...source.reference_ids, ...(source.message_id_header ? [source.message_id_header] : [])] : [];
  const composer = new MailComposer({
    from: account.display_name ? { name: account.display_name, address: account.email } : account.email,
    to: draft.to_addresses.map(formatAddress), cc: draft.cc_addresses.map(formatAddress), bcc: draft.bcc_addresses.map(formatAddress),
    subject: draft.subject, html, text: htmlToText(html), attachments,
    inReplyTo: replying ? source.message_id_header ?? undefined : undefined, references: references.length ? references.join(" ") : undefined
    // Bcc stays out of the transmitted message; it is kept only on the local copy.
  });
  const raw = await composer.compile().build();
  const parsed = await simpleParser(raw);
  const messageId = parseMessageIds(parsed.messageId)[0] ?? parsed.messageId ?? null;

  // Record the outgoing copy first so the thread shows it at once; a reply's references put it in the original thread.
  const { threadId } = await ingestMessage({ account, folderId: null, uid: null, flags: new Set(["\\Seen"]), size: raw.length, parsed });
  const row = await query<{ id: string }>("UPDATE mail_messages SET send_status = 'SENDING', bcc_addresses = $3 WHERE account_id = $1 AND message_id_header = $2 AND folder_id IS NULL RETURNING id",
    [account.id, messageId, JSON.stringify(draft.bcc_addresses)]);
  const rowId = row.rows[0]!.id;
  if (draft.client_id || draft.deal_id) {
    await query("UPDATE mail_threads SET client_id = coalesce(client_id, $2), deal_id = coalesce(deal_id, $3), link_source = coalesce(link_source, 'MANUAL') WHERE id = $1",
      [threadId, draft.client_id, draft.deal_id]);
  }
  await query("UPDATE mail_threads SET subject_key = CASE WHEN subject_key = '' THEN $2 ELSE subject_key END WHERE id = $1", [threadId, normalizeSubject(draft.subject)]);

  try {
    const auth = await accountAuth(account);
    const transport = await smtpTransport({ host: account.smtp_host, port: account.smtp_port, security: account.smtp_security }, auth);
    const envelope = { from: account.email, to: [...draft.to_addresses, ...draft.cc_addresses, ...draft.bcc_addresses].map((item) => item.address) };
    await transport.sendMail({ envelope, raw });
    transport.close();
  } catch (error) {
    const reason = failureReason(error);
    const message = reason === "UNKNOWN" ? smtpMessage(error) : reasonText[reason];
    await query("UPDATE mail_messages SET send_status = 'FAILED', send_error = $2 WHERE id = $1", [rowId, message]);
    await refreshThreads([threadId]);
    throw new ApiError(502, "MAIL_SEND_FAILED", message, { reason });
  }

  await query("UPDATE mail_messages SET send_status = 'SENT', send_error = NULL WHERE id = $1", [rowId]);
  await query("DELETE FROM mail_drafts WHERE id = $1", [draft.id]);
  await refreshThreads([threadId]);
  void storeSentCopy(account, raw, source && replying ? source : undefined).catch(() => undefined);
  return { messageId: rowId, threadId };
}

/** Appends to Sent (unless the provider saves sent mail itself) and flags the replied message. Best effort. */
async function storeSentCopy(account: MailAccountRow, raw: Buffer, repliedTo?: { folder_id: string | null; uid: string | null }): Promise<void> {
  const savesSent = account.provider !== "IMAP" && PROVIDER_SERVERS[account.provider].savesSent;
  const sent = await query<{ path: string }>("SELECT path FROM mail_folders WHERE account_id = $1 AND special_use = 'SENT'", [account.id]);
  const replied = repliedTo?.folder_id && repliedTo.uid
    ? (await query<{ path: string }>("SELECT path FROM mail_folders WHERE id = $1", [repliedTo.folder_id])).rows[0]
    : undefined;
  if (savesSent && !replied) return;
  const client = await openImap(account);
  try {
    if (!savesSent && sent.rows[0]) await client.append(sent.rows[0].path, raw, ["\\Seen"]);
    if (replied && repliedTo?.uid) {
      const lock = await client.getMailboxLock(replied.path);
      try { await client.messageFlagsAdd(repliedTo.uid, ["\\Answered"], { uid: true }); } finally { lock.release(); }
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
}

function smtpMessage(error: unknown): string {
  const value = error as { responseCode?: number; response?: string };
  if (value.responseCode && value.responseCode >= 500) return `Сервер отклонил письмо: ${value.response ?? value.responseCode}`.slice(0, 300);
  return "Письмо не отправлено — попробуйте ещё раз";
}

export const escapeHtml = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
