import { Router } from "express";
import { z } from "zod";
import { manageableUser } from "../access";
import { writeAudit } from "../audit";
import { requireAuth, requireRoles } from "../auth";
import { query } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { asOptionalDate, pagination, updatedFields } from "../http";
import { recordScope } from "../scope";

export const dealInputSchema = z.object({
  clientId: z.string().uuid(),
  ownerId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  stage: z.string().trim().regex(/^[A-Z0-9_]{2,50}$/).default("APPLICATION"),
  value: z.coerce.number().min(0).max(1_000_000_000).default(0),
  currency: z.string().trim().transform((value) => value.toUpperCase()).pipe(z.literal("UAH")).default("UAH"),
  probability: z.coerce.number().int().min(0).max(100).default(10),
  expectedCloseAt: z.string().datetime().nullable().optional(),
  closedAt: z.string().datetime().nullable().optional()
});
const dealPatch = dealInputSchema.omit({ clientId: true }).partial();
const idSchema = z.string().uuid();

export const dealsRouter = Router();

dealsRouter.get("/stages", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const result = await query(
    `SELECT id, key, name, color, sort_order AS "sortOrder", is_closed AS "isClosed"
     FROM deal_stages WHERE company_id = $1 ORDER BY sort_order, name`,
    [auth.companyId]
  );
  res.json({ data: result.rows });
}));

dealsRouter.post("/stages", requireRoles("DIRECTOR", "MANAGER"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const input = z.object({
    key: z.string().trim().regex(/^[A-Z0-9_]{2,50}$/),
    name: z.string().trim().min(1).max(100),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#6B7280"),
    sortOrder: z.number().int().min(0).max(1000),
    isClosed: z.boolean().default(false)
  }).parse(req.body);
  const result = await query(
    `INSERT INTO deal_stages (company_id, key, name, color, sort_order, is_closed)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, key, name, color, sort_order AS "sortOrder", is_closed AS "isClosed"`,
    [auth.companyId, input.key, input.name, input.color, input.sortOrder, input.isClosed]
  );
  await writeAudit(req, { auth, action: "DEAL_STAGE_CREATED", entityType: "deal_stage", entityId: result.rows[0]?.id as string });
  res.status(201).json({ data: result.rows[0] });
}));

dealsRouter.get("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const page = pagination(req);
  const filters = z.object({ stage: z.string().max(50).optional(), clientId: z.string().uuid().optional() }).parse(req.query);
  const scope = recordScope(auth, { company: "d.company_id", department: "d.department_id", owner: "d.owner_id" });
  const values: unknown[] = [...scope.values];
  const clauses = [scope.sql];
  if (filters.stage) { values.push(filters.stage); clauses.push(`d.stage = $${values.length}`); }
  if (filters.clientId) { values.push(filters.clientId); clauses.push(`d.client_id = $${values.length}`); }
  values.push(page.limit, page.offset);
  const result = await query(
    `SELECT ${dealColumns()}, count(*) OVER()::int AS "totalCount"
     FROM deals d JOIN clients c ON c.id = d.client_id JOIN users u ON u.id = d.owner_id
     LEFT JOIN deal_stages ds ON ds.company_id = d.company_id AND ds.key = d.stage
     WHERE ${clauses.join(" AND ")} ORDER BY d.updated_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  res.json({ data: result.rows.map(stripTotal), meta: { ...page, total: Number(result.rows[0]?.totalCount ?? 0) } });
}));

dealsRouter.post("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const input = dealInputSchema.parse(req.body);
  const owner = await manageableUser(auth, input.ownerId);
  await assertClientVisible(auth, input.clientId);
  await assertStage(auth.companyId, input.stage);
  const result = await query(
    `INSERT INTO deals
      (company_id, department_id, client_id, owner_id, title, stage, value, currency, probability, expected_close_at, closed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [auth.companyId, owner.department_id, input.clientId, owner.id, input.title, input.stage, input.value,
      input.currency, input.probability, asOptionalDate(input.expectedCloseAt), asOptionalDate(input.closedAt)]
  );
  const id = result.rows[0]?.id as string;
  await writeAudit(req, { auth, action: "DEAL_CREATED", entityType: "deal", entityId: id, departmentId: owner.department_id });
  res.status(201).json({ data: await scopedDeal(auth, id) });
}));

dealsRouter.get("/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  res.json({ data: await scopedDeal(auth, idSchema.parse(req.params.id)) });
}));

dealsRouter.patch("/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  await scopedDeal(auth, id);
  const input = dealPatch.parse(req.body);
  const data: Record<string, unknown> = {
    ...input,
    expectedCloseAt: asOptionalDate(input.expectedCloseAt),
    closedAt: asOptionalDate(input.closedAt)
  };
  if (input.ownerId) {
    const owner = await manageableUser(auth, input.ownerId);
    data.ownerId = owner.id;
    data.departmentId = owner.department_id;
  }
  if (input.stage) await assertStage(auth.companyId, input.stage);
  const update = updatedFields(data, {
    ownerId: "owner_id", departmentId: "department_id", title: "title", stage: "stage", value: "value",
    currency: "currency", probability: "probability", expectedCloseAt: "expected_close_at", closedAt: "closed_at"
  });
  if (!update.values.length) throw new ApiError(400, "NO_CHANGES", "No fields to update");
  update.values.push(id, auth.companyId);
  await query(`UPDATE deals SET ${update.sql} WHERE id = $${update.values.length - 1} AND company_id = $${update.values.length}`, update.values);
  await writeAudit(req, { auth, action: "DEAL_UPDATED", entityType: "deal", entityId: id, metadata: { fields: Object.keys(input) } });
  res.json({ data: await scopedDeal(auth, id) });
}));

dealsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  await scopedDeal(auth, id);
  await query("DELETE FROM deals WHERE id = $1 AND company_id = $2", [id, auth.companyId]);
  await writeAudit(req, { auth, action: "DEAL_DELETED", entityType: "deal", entityId: id });
  res.status(204).send();
}));

async function assertClientVisible(auth: ReturnType<typeof requireAuth>, id: string): Promise<void> {
  const scope = recordScope(auth, { company: "company_id", department: "department_id", owner: "owner_id" }, 2);
  const result = await query(`SELECT id FROM clients WHERE id = $1 AND ${scope.sql}`, [id, ...scope.values]);
  if (!result.rowCount) throw new ApiError(404, "CLIENT_NOT_FOUND", "Client not found");
}

async function assertStage(companyId: string, key: string): Promise<void> {
  const result = await query("SELECT id FROM deal_stages WHERE company_id = $1 AND key = $2", [companyId, key]);
  if (!result.rowCount) throw new ApiError(400, "INVALID_DEAL_STAGE", "Deal stage does not exist");
}

async function scopedDeal(auth: ReturnType<typeof requireAuth>, id: string): Promise<Record<string, unknown>> {
  const scope = recordScope(auth, { company: "d.company_id", department: "d.department_id", owner: "d.owner_id" }, 2);
  const result = await query(
    `SELECT ${dealColumns()}
     FROM deals d JOIN clients c ON c.id = d.client_id JOIN users u ON u.id = d.owner_id
     LEFT JOIN deal_stages ds ON ds.company_id = d.company_id AND ds.key = d.stage
     WHERE d.id = $1 AND ${scope.sql}`,
    [id, ...scope.values]
  );
  if (!result.rows[0]) throw new ApiError(404, "DEAL_NOT_FOUND", "Deal not found");
  return result.rows[0];
}

function dealColumns(): string {
  return `d.id, d.title, d.client_id AS "clientId", d.owner_id AS "ownerId", d.stage,
    json_build_object('key', d.stage, 'name', COALESCE(ds.name, d.stage), 'color', COALESCE(ds.color, '#6B7280')) AS "stageInfo",
    d.value::float8 AS value, d.currency, d.probability,
    d.expected_close_at AS "expectedCloseAt", d.closed_at AS "closedAt",
    json_build_object('id', c.id, 'name', c.name, 'companyName', c.company_name) AS client,
    json_build_object('id', u.id, 'fullName', u.full_name) AS owner,
    d.created_at AS "createdAt", d.updated_at AS "updatedAt"`;
}

function stripTotal(row: Record<string, unknown>): Record<string, unknown> {
  const { totalCount: _total, ...rest } = row;
  return rest;
}
