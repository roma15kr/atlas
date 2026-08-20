import { Router } from "express";
import { stringify } from "csv-stringify/sync";
import { z } from "zod";
import { manageableUser } from "../access";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { query } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { pagination, updatedFields } from "../http";
import { recordScope } from "../scope";

const clientInput = z.object({
  name: z.string().trim().min(1).max(160),
  companyName: z.string().trim().max(200).nullable().optional(),
  email: z.string().trim().email().max(254).nullable().optional(),
  phone: z.string().trim().max(60).nullable().optional(),
  source: z.string().trim().max(100).nullable().optional(),
  status: z.string().trim().min(1).max(60).default("NEW"),
  notes: z.string().trim().max(10_000).nullable().optional(),
  ownerId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).default({})
});

const clientPatch = clientInput.partial();
const idSchema = z.string().uuid();

export const clientsRouter = Router();

clientsRouter.get("/export.csv", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  if (auth.role !== "DIRECTOR") {
    await writeAudit(req, { auth, action: "CLIENT_EXPORT_DENIED", entityType: "client_export" });
    throw new ApiError(403, "DIRECTOR_ONLY", "Only a director can export the full client database");
  }
  const rows = await query(
    `SELECT c.id, c.name, c.company_name AS "companyName", c.email, c.phone, c.source, c.status,
            u.full_name AS "ownerName", d.name AS "departmentName", c.created_at AS "createdAt",
            c.updated_at AS "updatedAt"
     FROM clients c JOIN users u ON u.id = c.owner_id
     LEFT JOIN departments d ON d.id = c.department_id
     WHERE c.company_id = $1 ORDER BY c.created_at`,
    [auth.companyId]
  );
  await writeAudit(req, {
    auth,
    action: "CLIENT_EXPORT_SUCCEEDED",
    entityType: "client_export",
    metadata: { rowCount: rows.rowCount }
  });
  const csv = stringify(rows.rows, { header: true });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="atlas-clients-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`\uFEFF${csv}`);
}));

clientsRouter.get("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const page = pagination(req);
  const filters = z.object({ q: z.string().trim().max(100).optional(), status: z.string().max(60).optional() }).parse(req.query);
  const scope = recordScope(auth, { company: "c.company_id", department: "c.department_id", owner: "c.owner_id" });
  const values: unknown[] = [...scope.values];
  const clauses = [scope.sql];
  if (filters.q) {
    values.push(`%${filters.q}%`);
    clauses.push(`(c.name ILIKE $${values.length} OR c.company_name ILIKE $${values.length} OR c.email ILIKE $${values.length})`);
  }
  if (filters.status) {
    values.push(filters.status);
    clauses.push(`c.status = $${values.length}`);
  }
  values.push(page.limit, page.offset);
  const rows = await query(
    `SELECT ${clientColumns()}, count(*) OVER()::int AS "totalCount"
     FROM clients c JOIN users u ON u.id = c.owner_id
     WHERE ${clauses.join(" AND ")} ORDER BY c.updated_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  await writeAudit(req, { auth, action: "CLIENT_LIST_VIEWED", entityType: "client", metadata: { count: rows.rowCount } });
  res.json({ data: rows.rows.map(stripTotal), meta: { ...page, total: Number(rows.rows[0]?.totalCount ?? 0) } });
}));

clientsRouter.post("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const input = clientInput.parse(req.body);
  const owner = await manageableUser(auth, input.ownerId);
  const result = await query(
    `INSERT INTO clients
      (company_id, department_id, owner_id, name, company_name, email, phone, source, status, notes, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
     RETURNING id`,
    [auth.companyId, owner.department_id, owner.id, input.name, input.companyName ?? null,
      input.email ?? null, input.phone ?? null, input.source ?? null, input.status,
      input.notes ?? null, JSON.stringify(input.metadata)]
  );
  const id = result.rows[0]?.id as string;
  await writeAudit(req, { auth, action: "CLIENT_CREATED", entityType: "client", entityId: id, departmentId: owner.department_id });
  const created = await scopedClient(auth, id);
  res.status(201).json({ data: created });
}));

clientsRouter.get("/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const client = await scopedClient(auth, id);
  await writeAudit(req, { auth, action: "CLIENT_VIEWED", entityType: "client", entityId: id });
  res.json({ data: client });
}));

clientsRouter.patch("/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  await scopedClient(auth, id);
  const input = clientPatch.parse(req.body);
  const data: Record<string, unknown> = {
    ...input,
    companyName: input.companyName,
    metadata: input.metadata === undefined ? undefined : JSON.stringify(input.metadata)
  };
  if (input.ownerId !== undefined) {
    const owner = await manageableUser(auth, input.ownerId);
    data.ownerId = owner.id;
    data.departmentId = owner.department_id;
  }
  const update = updatedFields(data, {
    name: "name", companyName: "company_name", email: "email", phone: "phone", source: "source",
    status: "status", notes: "notes", ownerId: "owner_id", departmentId: "department_id", metadata: "metadata"
  });
  if (!update.values.length) throw new ApiError(400, "NO_CHANGES", "No fields to update");
  update.values.push(id, auth.companyId);
  await query(
    `UPDATE clients SET ${update.sql} WHERE id = $${update.values.length - 1} AND company_id = $${update.values.length}`,
    update.values
  );
  await writeAudit(req, { auth, action: "CLIENT_UPDATED", entityType: "client", entityId: id, metadata: { fields: Object.keys(input) } });
  res.json({ data: await scopedClient(auth, id) });
}));

clientsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  await scopedClient(auth, id);
  const deleted = await query("DELETE FROM clients WHERE id = $1 AND company_id = $2 RETURNING id", [id, auth.companyId]);
  if (!deleted.rowCount) throw new ApiError(404, "CLIENT_NOT_FOUND", "Client not found");
  await writeAudit(req, { auth, action: "CLIENT_DELETED", entityType: "client", entityId: id });
  res.status(204).send();
}));

clientsRouter.get("/:id/comments", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  await scopedClient(auth, id);
  const comments = await query(
    `SELECT cc.id, cc.body, cc.created_at AS "createdAt", cc.updated_at AS "updatedAt",
            json_build_object('id', u.id, 'fullName', u.full_name) AS author
     FROM client_comments cc JOIN users u ON u.id = cc.author_id
     WHERE cc.client_id = $1 AND cc.company_id = $2 ORDER BY cc.created_at DESC`,
    [id, auth.companyId]
  );
  res.json({ data: comments.rows });
}));

clientsRouter.post("/:id/comments", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  await scopedClient(auth, id);
  const input = z.object({ body: z.string().trim().min(1).max(5000) }).parse(req.body);
  const result = await query(
    `INSERT INTO client_comments (company_id, client_id, author_id, body)
     VALUES ($1, $2, $3, $4) RETURNING id, body, created_at AS "createdAt"`,
    [auth.companyId, id, auth.userId, input.body]
  );
  await writeAudit(req, { auth, action: "CLIENT_COMMENT_CREATED", entityType: "client", entityId: id });
  res.status(201).json({ data: result.rows[0] });
}));

async function scopedClient(auth: ReturnType<typeof requireAuth>, id: string): Promise<Record<string, unknown>> {
  const scope = recordScope(auth, { company: "c.company_id", department: "c.department_id", owner: "c.owner_id" }, 2);
  const result = await query(
    `SELECT ${clientColumns()} FROM clients c JOIN users u ON u.id = c.owner_id
     WHERE c.id = $1 AND ${scope.sql}`,
    [id, ...scope.values]
  );
  if (!result.rows[0]) throw new ApiError(404, "CLIENT_NOT_FOUND", "Client not found");
  return result.rows[0];
}

function clientColumns(): string {
  return `c.id, c.name, c.company_name AS "companyName", c.email, c.phone, c.source, c.status,
    c.notes, c.metadata, c.owner_id AS "ownerId", c.department_id AS "departmentId",
    json_build_object('id', u.id, 'fullName', u.full_name) AS owner,
    c.created_at AS "createdAt", c.updated_at AS "updatedAt"`;
}

function stripTotal(row: Record<string, unknown>): Record<string, unknown> {
  const { totalCount: _total, ...rest } = row;
  return rest;
}
