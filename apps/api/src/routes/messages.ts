import { Router } from "express";
import { z } from "zod";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { query } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { pagination } from "../http";
import { recordScope } from "../scope";

const channel = z.enum(["INTERNAL", "GMAIL", "OUTLOOK", "TELEGRAM", "WHATSAPP", "VIBER"]);
const idSchema = z.string().uuid();

export const messagesRouter = Router();

messagesRouter.get("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const page = pagination(req);
  const filters = z.object({ channel: channel.optional(), clientId: z.string().uuid().optional() }).parse(req.query);
  const scope = recordScope(auth, { company: "m.company_id", department: "m.department_id", owner: "m.user_id" });
  const values: unknown[] = [...scope.values];
  const clauses = [scope.sql];
  if (filters.channel) { values.push(filters.channel); clauses.push(`m.channel=$${values.length}`); }
  if (filters.clientId) { values.push(filters.clientId); clauses.push(`m.client_id=$${values.length}`); }
  values.push(page.limit, page.offset);
  const result = await query(
    `SELECT m.id, m.channel, m.direction, m.delivery_status AS "deliveryStatus", m.sender, m.recipient,
            CASE WHEN m.direction='INBOUND' THEN m.sender ELSE m.recipient END AS contact,
            m.subject, m.body, left(m.body,180) AS preview, m.client_id AS "clientId",
            m.occurred_at AS "occurredAt", m.occurred_at AS "receivedAt",
            (m.direction='INBOUND') AS unread,
            CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('id',c.id,'name',c.name,'companyName',c.company_name) END AS client,
            count(*) OVER()::int AS "totalCount"
     FROM messages m LEFT JOIN clients c ON c.id=m.client_id
     WHERE ${clauses.join(" AND ")} ORDER BY m.occurred_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  res.json({ data: result.rows.map(stripTotal), meta: { ...page, total: Number(result.rows[0]?.totalCount ?? 0) } });
}));

messagesRouter.post("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const input = z.object({
    channel,
    recipient: z.string().trim().min(1).max(300),
    subject: z.string().trim().max(300).nullable().optional(),
    body: z.string().trim().min(1).max(50_000),
    clientId: z.string().uuid().nullable().optional()
  }).parse(req.body);
  if (input.channel !== "INTERNAL") {
    await writeAudit(req, { auth, action: "MESSAGE_SEND_DENIED", entityType: "message", metadata: { channel: input.channel, reason: "adapter_not_implemented" } });
    throw new ApiError(501, "CHANNEL_ADAPTER_UNAVAILABLE", "This external channel is not enabled for sending yet");
  }
  if (input.clientId) await assertClientVisible(auth, input.clientId);
  const result = await query(
    `INSERT INTO messages
      (company_id,department_id,user_id,client_id,channel,direction,delivery_status,sender,recipient,subject,body)
     VALUES ($1,$2,$3,$4,'INTERNAL','OUTBOUND','SENT',$5,$6,$7,$8)
     RETURNING id, channel, direction, delivery_status AS "deliveryStatus", sender, recipient, subject, body,
               client_id AS "clientId", occurred_at AS "occurredAt"`,
    [auth.companyId, auth.departmentId, auth.userId, input.clientId ?? null, auth.username,
      input.recipient, input.subject ?? null, input.body]
  );
  await writeAudit(req, { auth, action: "MESSAGE_SENT", entityType: "message", entityId: result.rows[0]?.id as string, metadata: { channel: input.channel } });
  res.status(201).json({ data: result.rows[0] });
}));

messagesRouter.patch("/:id/client", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const input = z.object({ clientId: z.string().uuid().nullable() }).parse(req.body);
  if (input.clientId) await assertClientVisible(auth, input.clientId);
  const scope = recordScope(auth, { company: "company_id", department: "department_id", owner: "user_id" }, 3);
  const result = await query(
    `UPDATE messages SET client_id=$1 WHERE id=$2 AND ${scope.sql}
     RETURNING id, client_id AS "clientId"`,
    [input.clientId, id, ...scope.values]
  );
  if (!result.rows[0]) throw new ApiError(404, "MESSAGE_NOT_FOUND", "Message not found");
  await writeAudit(req, { auth, action: "MESSAGE_LINKED", entityType: "message", entityId: id, metadata: { clientId: input.clientId } });
  res.json({ data: result.rows[0] });
}));

async function assertClientVisible(auth: ReturnType<typeof requireAuth>, id: string): Promise<void> {
  const scope = recordScope(auth, { company: "company_id", department: "department_id", owner: "owner_id" }, 2);
  const result = await query(`SELECT id FROM clients WHERE id=$1 AND ${scope.sql}`, [id, ...scope.values]);
  if (!result.rowCount) throw new ApiError(404, "CLIENT_NOT_FOUND", "Client not found");
}

function stripTotal(row: Record<string, unknown>): Record<string, unknown> {
  const { totalCount: _total, ...rest } = row;
  return rest;
}
