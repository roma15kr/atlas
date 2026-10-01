import { Router, type Request } from "express";
import { z } from "zod";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { query } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { recordScope } from "../scope";
import type { AuthContext } from "../types";
import { dealScope } from "./deals";
import { canReadThread, threadMessages } from "./mail";
import { canReadTelegram, messageColumns } from "./telegram";

const idSchema = z.string().uuid();

/** One customer conversation in a client's or deal's history, whatever the channel. */
export interface CommunicationEntry {
  channel: "EMAIL" | "TELEGRAM";
  id: string;
  title: string;
  participants: string[];
  lastActivityAt: string;
  messageCount: number;
  owner: { id: string; fullName: string } | null;
  snippet: string | null;
}

type Source = (filter: { clientId?: string; dealId?: string }) => Promise<CommunicationEntry[]>;
const sources: Source[] = [];

/** Channels register here; the history merges them newest first. */
export function registerCommunicationSource(source: Source): void { sources.push(source); }

registerCommunicationSource(async ({ clientId, dealId }) => {
  const result = await query<CommunicationEntry>(
    `SELECT 'EMAIL' AS channel, t.id, coalesce(nullif(t.subject, ''), '(без темы)') AS title, t.participants, t.last_message_at AS "lastActivityAt",
            t.message_count AS "messageCount", json_build_object('id', u.id, 'fullName', u.full_name) AS owner,
            (SELECT m.snippet FROM mail_messages m WHERE m.thread_id = t.id ORDER BY m.sent_at DESC LIMIT 1) AS snippet
     FROM mail_threads t JOIN users u ON u.id = t.user_id
     WHERE ($1::uuid IS NULL OR t.client_id = $1) AND ($2::uuid IS NULL OR t.deal_id = $2) AND t.message_count > 0
     ORDER BY t.last_message_at DESC LIMIT 200`,
    [clientId ?? null, dealId ?? null]
  );
  return result.rows;
});

registerCommunicationSource(async ({ clientId, dealId }) => {
  const result = await query<CommunicationEntry>(
    `SELECT 'TELEGRAM' AS channel, c.id,
            coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), '@' || c.username, 'Telegram ' || c.telegram_user_id) AS title,
            ARRAY[coalesce('@' || c.username, c.telegram_user_id::text)] AS participants,
            coalesce(c.last_message_at, c.created_at) AS "lastActivityAt",
            (SELECT count(*)::int FROM telegram_messages m WHERE m.contact_id = c.id) AS "messageCount",
            CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'fullName', u.full_name) END AS owner,
            (SELECT coalesce(m.text, m.summary) FROM telegram_messages m WHERE m.contact_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS snippet
     FROM telegram_contacts c LEFT JOIN users u ON u.id = c.responsible_id
     WHERE ($1::uuid IS NULL OR c.client_id = $1) AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM telegram_deal_links l WHERE l.contact_id = c.id AND l.deal_id = $2))
       AND EXISTS (SELECT 1 FROM telegram_messages m WHERE m.contact_id = c.id)
     ORDER BY "lastActivityAt" DESC LIMIT 200`,
    [clientId ?? null, dealId ?? null]
  );
  return result.rows;
});

export const communicationsRouter = Router();

async function deny(req: Request, auth: AuthContext, entityType: string, id: string, code: string, message: string): Promise<never> {
  await writeAudit(req, { auth, action: "COMMUNICATION_HISTORY_ACCESS_DENIED", entityType, entityId: id });
  throw new ApiError(404, code, message);
}

async function history(filter: { clientId?: string; dealId?: string }): Promise<CommunicationEntry[]> {
  const lists = await Promise.all(sources.map((source) => source(filter)));
  return lists.flat().sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
}

communicationsRouter.get("/clients/:id/communications", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const scope = recordScope(auth, {}, 2);
  if (!(await query(`SELECT 1 FROM clients WHERE id = $1 AND ${scope.sql}`, [id, ...scope.values])).rowCount) {
    await deny(req, auth, "client", id, "CLIENT_NOT_FOUND", "Client not found");
  }
  res.json({ data: await history({ clientId: id }) });
}));

communicationsRouter.get("/deals/:id/communications", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const scope = dealScope(auth, 2);
  if (!(await query(`SELECT 1 FROM deals d WHERE d.id = $1 AND ${scope.sql}`, [id, ...scope.values])).rowCount) {
    await deny(req, auth, "deal", id, "DEAL_NOT_FOUND", "Deal not found");
  }
  res.json({ data: await history({ dealId: id }) });
}));

/** A linked mail thread, read-only: the owner or anyone who sees its client or deal. Bcc is only shown to the owner. */
communicationsRouter.get("/communications/mail/:threadId", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.threadId);
  if (!await canReadThread(auth, id)) await deny(req, auth, "mail_thread", id, "MAIL_NOT_FOUND", "Conversation not found");
  const thread = await query<{ subject: string; user_id: string; mailbox_email: string; full_name: string }>(
    "SELECT t.subject, t.user_id, t.mailbox_email, u.full_name FROM mail_threads t JOIN users u ON u.id = t.user_id WHERE t.id = $1", [id]
  );
  const row = thread.rows[0]!;
  const messages = await threadMessages(id, row.user_id === auth.userId);
  res.json({ data: { id, subject: row.subject, mailboxEmail: row.mailbox_email, owner: { id: row.user_id, fullName: row.full_name }, messages } });
}));

/** A Telegram conversation, read-only, for anyone who sees the conversation, its client or a linked deal. */
communicationsRouter.get("/communications/telegram/:contactId", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.contactId);
  if (!await canReadTelegram(auth, id)) await deny(req, auth, "telegram_contact", id, "TELEGRAM_CONTACT_NOT_FOUND", "Conversation not found");
  const contact = (await query<{ title: string; responsible: { id: string; fullName: string } | null }>(
    `SELECT coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), '@' || c.username, 'Telegram ' || c.telegram_user_id) AS title,
            CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'fullName', u.full_name) END AS responsible
     FROM telegram_contacts c LEFT JOIN users u ON u.id = c.responsible_id WHERE c.id = $1`, [id])).rows[0]!;
  const messages = await query(`SELECT ${messageColumns} FROM telegram_messages m LEFT JOIN users s ON s.id = m.sent_by WHERE m.contact_id = $1 ORDER BY m.created_at, m.id LIMIT 2000`, [id]);
  res.json({ data: { id, title: contact.title, responsible: contact.responsible, messages: messages.rows } });
}));
