import { Router, type Request } from "express";
import { z } from "zod";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { KPI_SOURCE_UNITS, KPI_SOURCES, recomputeKpis, type KpiSource } from "../automation/kpis";
import { query } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { canManageUser } from "../scope";
import type { AuthContext, Role } from "../types";

/** KPIs are set by directors for anyone and by department heads for their employees. */
export const kpisRouter = Router();

interface KpiOwner { id: string; company_id: string; department_id: string | null; role: Role; status: string }

export const kpiColumns = `k.id, k.user_id AS "userId", k.name, k.target::float8 AS target, k.actual::float8 AS actual, k.unit,
  k.weight::float8 AS weight, k.due_at AS "dueAt", k.source, to_char(k.period_start, 'YYYY-MM-DD') AS "periodStart",
  to_char(k.period_end, 'YYYY-MM-DD') AS "periodEnd", k.computed_at AS "computedAt"`;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const kpiFields = {
  name: z.string().trim().min(1).max(120),
  target: z.number().positive().max(1e12),
  unit: z.string().trim().min(1).max(20),
  weight: z.number().min(0).max(1),
  dueAt: z.string().datetime().nullable(),
  actual: z.number().min(0).max(1e12),
  periodStart: date,
  periodEnd: date
};
const createSchema = z.object({
  userId: z.string().uuid(),
  source: z.enum(KPI_SOURCES).default("MANUAL"),
  name: kpiFields.name,
  target: kpiFields.target,
  unit: kpiFields.unit.optional(),
  weight: kpiFields.weight.default(1),
  dueAt: kpiFields.dueAt.optional(),
  actual: kpiFields.actual.optional(),
  periodStart: kpiFields.periodStart.optional(),
  periodEnd: kpiFields.periodEnd.optional()
}).strict();
const updateSchema = z.object({
  name: kpiFields.name.optional(),
  target: kpiFields.target.optional(),
  unit: kpiFields.unit.optional(),
  weight: kpiFields.weight.optional(),
  dueAt: kpiFields.dueAt.optional(),
  actual: kpiFields.actual.optional(),
  periodStart: kpiFields.periodStart.optional(),
  periodEnd: kpiFields.periodEnd.optional(),
  source: z.enum(KPI_SOURCES).optional()
}).strict().refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });

async function loadOwner(auth: AuthContext, userId: string): Promise<KpiOwner> {
  const result = await query<KpiOwner>("SELECT id, company_id, department_id, role, status FROM users WHERE id = $1", [userId]);
  const owner = result.rows[0];
  if (!owner || !canManageUser(auth, owner)) throw new ApiError(404, "USER_NOT_FOUND", "User not found");
  return owner;
}

/** Directors manage anyone; heads only employees of their own department, never themselves. */
async function assertCanManage(req: Request, auth: AuthContext, owner: KpiOwner, kpiId: string | null): Promise<void> {
  const allowed = auth.role === "DIRECTOR" || auth.role === "MANAGER" && owner.role === "EMPLOYEE" && owner.department_id === auth.departmentId;
  if (allowed && owner.status === "ACTIVE") return;
  if (allowed) throw new ApiError(409, "USER_NOT_ACTIVE", "KPIs can be set only for active users");
  await writeAudit(req, { auth, action: "KPI_CHANGE_DENIED", entityType: "kpi", entityId: kpiId, departmentId: owner.department_id, metadata: { userId: owner.id } });
  throw new ApiError(403, "KPI_MANAGER_ONLY", "Only a director or the employee's department head manages KPIs");
}

async function loadKpi(auth: AuthContext, id: string): Promise<{ owner: KpiOwner; source: KpiSource }> {
  const result = await query<{ user_id: string; source: KpiSource }>("SELECT user_id, source FROM kpis WHERE id = $1 AND company_id = $2", [id, auth.companyId]);
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "KPI_NOT_FOUND", "KPI not found");
  try {
    return { owner: await loadOwner(auth, row.user_id), source: row.source };
  } catch {
    throw new ApiError(404, "KPI_NOT_FOUND", "KPI not found");
  }
}

async function kpiById(id: string): Promise<Record<string, unknown>> {
  return (await query(`SELECT ${kpiColumns} FROM kpis k WHERE k.id = $1`, [id])).rows[0]!;
}

kpisRouter.get("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const requested = z.object({ userId: z.string().uuid().optional() }).parse(req.query).userId;
  const owner = await loadOwner(auth, auth.role === "EMPLOYEE" ? auth.userId : requested ?? auth.userId);
  const result = await query(`SELECT ${kpiColumns} FROM kpis k WHERE k.user_id = $1 ORDER BY k.due_at NULLS LAST, k.name`, [owner.id]);
  res.json({ data: result.rows });
}));

kpisRouter.post("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const input = createSchema.parse(req.body);
  const owner = await loadOwner(auth, input.userId);
  await assertCanManage(req, auth, owner, null);
  const automatic = input.source !== "MANUAL";
  if (automatic && input.actual !== undefined) throw new ApiError(400, "KPI_ACTUAL_COMPUTED", "Automatic KPIs are measured by Atlas");
  if (!automatic && !input.unit) throw new ApiError(400, "VALIDATION_ERROR", "Unit is required");
  const unit = automatic ? KPI_SOURCE_UNITS[input.source as Exclude<KpiSource, "MANUAL">] : input.unit!;
  const result = await query<{ id: string }>(
    `INSERT INTO kpis (company_id, user_id, name, target, actual, unit, weight, due_at, source, period_start, period_end, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
       CASE WHEN $9 = 'MANUAL' THEN $10::date ELSE COALESCE($10::date, date_trunc('month', now() AT TIME ZONE 'Europe/Kyiv')::date) END,
       CASE WHEN $9 = 'MANUAL' THEN $11::date ELSE COALESCE($11::date, (date_trunc('month', now() AT TIME ZONE 'Europe/Kyiv') + interval '1 month - 1 day')::date) END,
       $12)
     RETURNING id`,
    [auth.companyId, owner.id, input.name, input.target, input.actual ?? 0, unit, input.weight, input.dueAt ?? null,
      input.source, input.periodStart ?? null, input.periodEnd ?? null, auth.userId]
  ).catch(rethrowPeriod);
  const id = result.rows[0]!.id;
  if (automatic) await recomputeKpis([id]);
  await writeAudit(req, { auth, action: "KPI_CREATED", entityType: "kpi", entityId: id, departmentId: owner.department_id, metadata: { userId: owner.id, source: input.source } });
  res.status(201).json({ data: await kpiById(id) });
}));

kpisRouter.patch("/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = z.string().uuid().parse(req.params.id);
  const { owner, source } = await loadKpi(auth, id);
  await assertCanManage(req, auth, owner, id);
  const input = updateSchema.parse(req.body);
  if (input.source && input.source !== source) throw new ApiError(400, "KPI_SOURCE_LOCKED", "Delete the KPI and create a new one to change its source");
  if (source !== "MANUAL" && input.actual !== undefined) throw new ApiError(400, "KPI_ACTUAL_COMPUTED", "Automatic KPIs are measured by Atlas");
  if (source !== "MANUAL" && input.unit !== undefined) throw new ApiError(400, "KPI_UNIT_LOCKED", "Automatic KPIs have a fixed unit");
  await query(
    `UPDATE kpis SET name = COALESCE($2, name), target = COALESCE($3, target), unit = COALESCE($4, unit),
       weight = COALESCE($5, weight), due_at = CASE WHEN $6 THEN $7::timestamptz ELSE due_at END,
       actual = COALESCE($8, actual), period_start = COALESCE($9::date, period_start), period_end = COALESCE($10::date, period_end)
     WHERE id = $1`,
    [id, input.name ?? null, input.target ?? null, input.unit ?? null, input.weight ?? null, input.dueAt !== undefined, input.dueAt ?? null,
      input.actual ?? null, input.periodStart ?? null, input.periodEnd ?? null]
  ).catch(rethrowPeriod);
  if (source !== "MANUAL") await recomputeKpis([id]);
  await writeAudit(req, { auth, action: "KPI_UPDATED", entityType: "kpi", entityId: id, departmentId: owner.department_id, metadata: { userId: owner.id, fields: Object.keys(input) } });
  res.json({ data: await kpiById(id) });
}));

kpisRouter.delete("/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = z.string().uuid().parse(req.params.id);
  const { owner } = await loadKpi(auth, id);
  await assertCanManage(req, auth, owner, id);
  await query("DELETE FROM kpis WHERE id = $1", [id]);
  await writeAudit(req, { auth, action: "KPI_DELETED", entityType: "kpi", entityId: id, departmentId: owner.department_id, metadata: { userId: owner.id } });
  res.status(204).send();
}));

function rethrowPeriod(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && error.code === "23514") {
    throw new ApiError(400, "INVALID_KPI_PERIOD", "The KPI period must end on or after its start");
  }
  throw error;
}
