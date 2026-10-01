import { Router, type Request } from "express";
import { z } from "zod";
import { assertOwnerFunnelAccess, canAccessFunnel, manageableUser, type TargetUser } from "../access";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { query } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { asOptionalDate, pagination, updatedFields } from "../http";
import { funnelAccessSql, recordScope } from "../scope";
import type { AuthContext } from "../types";

export const dealInputSchema = z.object({
  clientId: z.string().uuid(),
  ownerId: z.string().uuid().optional(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  value: z.coerce.number().min(0).max(1_000_000_000).default(0),
  currency: z.string().trim().transform((value) => value.toUpperCase()).pipe(z.literal("UAH")).default("UAH"),
  probability: z.coerce.number().int().min(0).max(100).default(10),
  expectedCloseAt: z.string().datetime().nullable().optional(),
  closedAt: z.string().datetime().nullable().optional()
});
const dealPatch = dealInputSchema.omit({ clientId: true }).partial();
const idSchema = z.string().uuid();

export const dealsRouter = Router();

dealsRouter.get("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const page = pagination(req);
  const filters = z.object({
    funnelId: z.string().uuid().optional(),
    stageId: z.string().uuid().optional(),
    clientId: z.string().uuid().optional()
  }).parse(req.query);
  const scope = dealScope(auth);
  const values: unknown[] = [...scope.values];
  const clauses = [scope.sql];
  if (filters.funnelId) { values.push(filters.funnelId); clauses.push(`d.funnel_id = $${values.length}`); }
  if (filters.stageId) { values.push(filters.stageId); clauses.push(`d.stage_id = $${values.length}`); }
  if (filters.clientId) { values.push(filters.clientId); clauses.push(`d.client_id = $${values.length}`); }
  values.push(page.limit, page.offset);
  const result = await query(
    `SELECT ${dealColumns()}, count(*) OVER()::int AS "totalCount"
     FROM deals d JOIN clients c ON c.id = d.client_id JOIN users u ON u.id = d.owner_id
     JOIN deal_stages ds ON ds.id = d.stage_id
     WHERE ${clauses.join(" AND ")} ORDER BY d.updated_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  res.json({ data: result.rows.map(stripTotal), meta: { ...page, total: Number(result.rows[0]?.totalCount ?? 0) } });
}));

dealsRouter.post("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = await createDeal(req, auth, req.body);
  res.status(201).json({ data: await scopedDeal(auth, id) });
}));

/** Creates a deal with the same rules as `POST /deals`; also used when creating a deal from mail or Telegram. */
export async function createDeal(req: Request, auth: AuthContext, raw: unknown): Promise<string> {
  const input = dealInputSchema.parse(raw);
  await assertFunnelAccessible(auth, input.funnelId);
  const stageId = await resolveStage(auth.companyId, input.funnelId, input.stageId);
  const owner = await manageableUser(auth, input.ownerId);
  await assertOwnerFunnelAccess(owner, input.funnelId);
  await assertClientVisible(auth, input.clientId);
  const result = await query(
    `INSERT INTO deals
      (company_id, department_id, client_id, owner_id, title, funnel_id, stage_id, value, currency, probability, expected_close_at, closed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [auth.companyId, owner.department_id, input.clientId, owner.id, input.title, input.funnelId, stageId, input.value,
      input.currency, input.probability, asOptionalDate(input.expectedCloseAt), asOptionalDate(input.closedAt)]
  );
  const id = result.rows[0]?.id as string;
  await writeAudit(req, { auth, action: "DEAL_CREATED", entityType: "deal", entityId: id, departmentId: owner.department_id, metadata: { funnelId: input.funnelId } });
  return id;
}

dealsRouter.get("/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  res.json({ data: await scopedDeal(auth, idSchema.parse(req.params.id)) });
}));

dealsRouter.patch("/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const existing = await scopedDeal(auth, id) as { funnelId: string; ownerId: string };
  const input = dealPatch.parse(req.body);
  const data: Record<string, unknown> = {
    ...input,
    expectedCloseAt: asOptionalDate(input.expectedCloseAt),
    closedAt: asOptionalDate(input.closedAt)
  };
  const funnelId = input.funnelId ?? existing.funnelId;
  const funnelChanged = funnelId !== existing.funnelId;
  if (funnelChanged) {
    await assertFunnelAccessible(auth, funnelId);
    if (!input.stageId) throw new ApiError(400, "INVALID_DEAL_STAGE", "Choose a stage in the target funnel");
  }
  if (input.stageId) data.stageId = await resolveStage(auth.companyId, funnelId, input.stageId);
  let owner: TargetUser | null = null;
  if (input.ownerId) {
    owner = await manageableUser(auth, input.ownerId);
    data.ownerId = owner.id;
    data.departmentId = owner.department_id;
  }
  if (owner || funnelChanged) {
    owner ??= await activeUser(existing.ownerId);
    await assertOwnerFunnelAccess(owner, funnelId);
  }
  const update = updatedFields(data, {
    ownerId: "owner_id", departmentId: "department_id", title: "title", funnelId: "funnel_id", stageId: "stage_id", value: "value",
    currency: "currency", probability: "probability", expectedCloseAt: "expected_close_at", closedAt: "closed_at"
  });
  if (!update.values.length) throw new ApiError(400, "NO_CHANGES", "No fields to update");
  update.values.push(id, auth.companyId);
  await query(`UPDATE deals SET ${update.sql} WHERE id = $${update.values.length - 1} AND company_id = $${update.values.length}`, update.values);
  await writeAudit(req, {
    auth, action: "DEAL_UPDATED", entityType: "deal", entityId: id,
    metadata: { fields: Object.keys(input), ...(funnelChanged ? { funnelId, previousFunnelId: existing.funnelId } : {}) }
  });
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

/** Deals are visible only inside the caller's record scope and funnels they may open. */
export function dealScope(auth: ReturnType<typeof requireAuth>, startIndex = 1): { sql: string; values: unknown[] } {
  const record = recordScope(auth, { company: "d.company_id", department: "d.department_id", owner: "d.owner_id" }, startIndex);
  const funnel = funnelAccessSql(auth, "d.funnel_id", startIndex + record.values.length);
  return { sql: `${record.sql} AND ${funnel.sql}`, values: [...record.values, ...funnel.values] };
}

async function assertFunnelAccessible(auth: ReturnType<typeof requireAuth>, funnelId: string): Promise<void> {
  if (!await canAccessFunnel(auth, funnelId)) throw new ApiError(404, "FUNNEL_NOT_FOUND", "Funnel not found");
}

async function activeUser(id: string): Promise<TargetUser> {
  const result = await query<TargetUser>("SELECT id, company_id, department_id, role FROM users WHERE id = $1", [id]);
  if (!result.rows[0]) throw new ApiError(404, "USER_NOT_FOUND", "Deal owner not found");
  return result.rows[0];
}

async function assertClientVisible(auth: ReturnType<typeof requireAuth>, id: string): Promise<void> {
  const scope = recordScope(auth, { company: "company_id", department: "department_id", owner: "owner_id" }, 2);
  const result = await query(`SELECT id FROM clients WHERE id = $1 AND ${scope.sql}`, [id, ...scope.values]);
  if (!result.rowCount) throw new ApiError(404, "CLIENT_NOT_FOUND", "Client not found");
}

/** Returns the requested stage of the funnel, or the funnel's first OPEN stage when none is given. */
async function resolveStage(companyId: string, funnelId: string, stageId?: string): Promise<string> {
  const result = stageId
    ? await query<{ id: string }>("SELECT id FROM deal_stages WHERE id = $1 AND funnel_id = $2 AND company_id = $3", [stageId, funnelId, companyId])
    : await query<{ id: string }>(
      "SELECT id FROM deal_stages WHERE funnel_id = $1 AND company_id = $2 AND outcome = 'OPEN' ORDER BY sort_order LIMIT 1",
      [funnelId, companyId]
    );
  if (!result.rows[0]) throw new ApiError(400, "INVALID_DEAL_STAGE", "Deal stage does not exist in this funnel");
  return result.rows[0].id;
}

async function scopedDeal(auth: ReturnType<typeof requireAuth>, id: string): Promise<Record<string, unknown>> {
  const scope = dealScope(auth, 2);
  const result = await query(
    `SELECT ${dealColumns()}
     FROM deals d JOIN clients c ON c.id = d.client_id JOIN users u ON u.id = d.owner_id
     JOIN deal_stages ds ON ds.id = d.stage_id
     WHERE d.id = $1 AND ${scope.sql}`,
    [id, ...scope.values]
  );
  if (!result.rows[0]) throw new ApiError(404, "DEAL_NOT_FOUND", "Deal not found");
  return result.rows[0];
}

function dealColumns(): string {
  return `d.id, d.title, d.client_id AS "clientId", d.owner_id AS "ownerId", d.funnel_id AS "funnelId",
    json_build_object('id', ds.id, 'name', ds.name, 'color', ds.color, 'outcome', ds.outcome) AS stage,
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
