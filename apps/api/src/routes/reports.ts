import { Router } from "express";
import { z } from "zod";
import { manageableUser } from "../access";
import { writeAudit } from "../audit";
import { requireAuth, requireRoles } from "../auth";
import { query } from "../db";
import { asyncHandler } from "../errors";
import { pagination } from "../http";

export const reportsRouter = Router();

reportsRouter.get("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const page = pagination(req);
  const values: unknown[] = [auth.companyId];
  const clauses = ["r.company_id = $1"];
  if (auth.role === "MANAGER") { values.push(auth.departmentId); clauses.push("r.department_id IS NOT DISTINCT FROM $2"); }
  if (auth.role === "EMPLOYEE") { values.push(auth.userId); clauses.push("r.target_user_id = $2"); }
  values.push(page.limit, page.offset);
  const result = await query(
    `SELECT r.id, r.name, r.metrics, r.period_start AS "periodStart", r.period_end AS "periodEnd",
            r.schedule, r.status, r.result, r.target_user_id AS "targetUserId",
            COALESCE(u.full_name, 'Team') AS "targetUserName",
            json_build_object('id', u.id, 'fullName', u.full_name) AS "targetUser",
            r.created_at AS "createdAt", count(*) OVER()::int AS "totalCount"
     FROM reports r LEFT JOIN users u ON u.id = r.target_user_id
     WHERE ${clauses.join(" AND ")} ORDER BY r.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  res.json({ data: result.rows.map(stripTotal), meta: { ...page, total: Number(result.rows[0]?.totalCount ?? 0) } });
}));

reportsRouter.post("/", requireRoles("DIRECTOR", "MANAGER"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const input = z.object({
    name: z.string().trim().min(1).max(200),
    targetUserId: z.string().uuid().optional(),
    targetUserName: z.string().trim().max(200).optional(),
    metrics: z.array(z.string().trim().min(1).max(100)).min(1).max(12),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    schedule: z.enum(["ONCE", "DAILY", "WEEKLY", "MONTHLY"]).default("ONCE")
  }).refine((value) => value.periodEnd >= value.periodStart, { message: "periodEnd must be on or after periodStart" }).parse(req.body);
  const target = await resolveTarget(auth, input.targetUserId, input.targetUserName);
  const departmentId = target?.department_id ?? (auth.role === "MANAGER" ? auth.departmentId : null);
  const periodStart = input.periodStart.toISOString().slice(0, 10);
  const periodEnd = input.periodEnd.toISOString().slice(0, 10);
  const metrics = await reportMetrics(auth.companyId, target?.id ?? null, target ? null : departmentId, periodStart, periodEnd);
  const result = await query(
    `INSERT INTO reports
      (company_id, department_id, created_by, target_user_id, name, metrics, period_start, period_end, schedule, status, result)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,'READY',$10::jsonb)
     RETURNING id, name, metrics, period_start AS "periodStart", period_end AS "periodEnd", schedule, status, result,
               created_at AS "createdAt"`,
    [auth.companyId, departmentId, auth.userId, target?.id ?? null, input.name, JSON.stringify(input.metrics),
      periodStart, periodEnd, input.schedule, JSON.stringify(metrics)]
  );
  await writeAudit(req, { auth, action: "REPORT_CREATED", entityType: "report", entityId: result.rows[0]?.id as string, departmentId, metadata: { metrics: input.metrics } });
  res.status(201).json({ data: { ...result.rows[0], targetUserName: input.targetUserName ?? "Team" } });
}));

async function resolveTarget(
  auth: ReturnType<typeof requireAuth>,
  targetUserId?: string,
  targetUserName?: string
): Promise<Awaited<ReturnType<typeof manageableUser>> | null> {
  if (targetUserId) return manageableUser(auth, targetUserId);
  if (!targetUserName || ["team", "команда"].includes(targetUserName.toLowerCase())) return null;
  const found = await query<{ id: string }>(
    "SELECT id FROM users WHERE company_id=$1 AND lower(full_name)=lower($2) AND status='ACTIVE' LIMIT 2",
    [auth.companyId, targetUserName]
  );
  return found.rowCount === 1 ? manageableUser(auth, found.rows[0]!.id) : null;
}

async function reportMetrics(
  companyId: string,
  userId: string | null,
  departmentId: string | null,
  start: string,
  end: string
): Promise<Record<string, unknown>> {
  const [kpi, deals, tasks, attendance] = await Promise.all([
    query<{ progress: number }>(
      `SELECT COALESCE(sum(LEAST(k.actual / NULLIF(k.target, 0), 1) * k.weight) / NULLIF(sum(k.weight), 0), 0)::float8 AS progress
       FROM kpis k JOIN users ku ON ku.id=k.user_id
       WHERE k.company_id=$1 AND ($2::uuid IS NULL OR k.user_id=$2) AND ($3::uuid IS NULL OR ku.department_id=$3)`,
      [companyId, userId, departmentId]
    ),
    query<{ total: number; won: number; value: number }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE ds.is_closed AND d.stage <> 'LOST')::int AS won,
              COALESCE(sum(d.value) FILTER (WHERE ds.is_closed AND d.stage <> 'LOST'), 0)::float8 AS value
       FROM deals d LEFT JOIN deal_stages ds ON ds.company_id = d.company_id AND ds.key = d.stage
       WHERE d.company_id=$1 AND ($2::uuid IS NULL OR d.owner_id=$2) AND ($3::uuid IS NULL OR d.department_id=$3)
         AND d.created_at::date BETWEEN $4::date AND $5::date`,
      [companyId, userId, departmentId, start, end]
    ),
    query<{ total: number; done: number; overdue: number }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'DONE')::int AS done,
              count(*) FILTER (WHERE status <> 'DONE' AND due_at < now())::int AS overdue
       FROM tasks WHERE company_id=$1 AND ($2::uuid IS NULL OR assignee_id=$2) AND ($3::uuid IS NULL OR department_id=$3)
         AND created_at::date BETWEEN $4::date AND $5::date`,
      [companyId, userId, departmentId, start, end]
    ),
    query<{ activeDays: number; firstSeenAt: string | null; lastSeenAt: string | null }>(
      `SELECT count(DISTINCT occurred_at::date) FILTER (WHERE event='ONLINE')::int AS "activeDays",
              min(occurred_at)::text AS "firstSeenAt", max(occurred_at)::text AS "lastSeenAt"
       FROM presence_events pe JOIN users pu ON pu.id=pe.user_id
       WHERE pe.company_id=$1 AND ($2::uuid IS NULL OR pe.user_id=$2) AND ($3::uuid IS NULL OR pu.department_id=$3)
         AND occurred_at::date BETWEEN $4::date AND $5::date`,
      [companyId, userId, departmentId, start, end]
    )
  ]);
  const deal = deals.rows[0] ?? { total: 0, won: 0, value: 0 };
  return {
    kpiProgress: kpi.rows[0]?.progress ?? 0,
    deals: { ...deal, currency: "UAH" },
    conversion: deal.total ? deal.won / deal.total : 0,
    tasks: tasks.rows[0] ?? { total: 0, done: 0, overdue: 0 },
    attendance: attendance.rows[0] ?? { activeDays: 0, firstSeenAt: null, lastSeenAt: null }
  };
}

function stripTotal(row: Record<string, unknown>): Record<string, unknown> {
  const { totalCount: _total, ...rest } = row;
  return rest;
}
