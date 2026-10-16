import { Router } from "express";
import { scopeDepartments, taskAccessSql } from "../scope";
import type { AuthContext } from "../types";
import { z } from "zod";
import { writeAudit } from "../audit";
import { requireAuth, requireRoles } from "../auth";
import { query } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { pagination } from "../http";
import { dealScope } from "./deals";

export const alertsRouter = Router();

alertsRouter.get("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const page = pagination(req);
  const { state } = z.object({ state: z.enum(["open", "all"]).default("open") }).parse(req.query);
  const visible = alertVisibility(auth);
  const values: unknown[] = [...visible.values];
  const clauses = [visible.sql];
  if (state === "open") clauses.push("a.resolved_at IS NULL");
  values.push(page.limit, page.offset);
  const result = await query(
    `SELECT a.id, a.severity, a.category, a.rule, a.title, a.summary, a.evidence, a.deal_id AS "dealId",
            (SELECT d.client_id FROM deals d WHERE d.id = a.deal_id) AS "clientId", a.resolved_at AS "resolvedAt",
            a.user_id AS "userId", u.full_name AS "userName", a.acknowledged_at AS "acknowledgedAt",
            (a.acknowledged_at IS NOT NULL) AS acknowledged,
            a.acknowledged_by AS "acknowledgedBy", a.created_at AS "createdAt",
            count(*) OVER()::int AS "totalCount"
     FROM alerts a LEFT JOIN users u ON u.id=a.user_id WHERE ${clauses.join(" AND ")} ORDER BY a.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  res.json({ data: await withOverdueTasks(auth, result.rows.map(stripTotal)), meta: { ...page, total: Number(result.rows[0]?.totalCount ?? 0) } });
}));

alertsRouter.patch("/:id/acknowledge", requireRoles("DIRECTOR", "MANAGER"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = z.string().uuid().parse(req.params.id);
  const values: unknown[] = [auth.userId, id, auth.companyId];
  let scope = "company_id = $3";
  if (auth.role === "MANAGER") { values.push(scopeDepartments(auth)); scope += " AND department_id = ANY($4::uuid[])"; }
  const result = await query(
    `UPDATE alerts SET acknowledged_at = now(), acknowledged_by = $1
     WHERE id = $2 AND ${scope}
     RETURNING id, acknowledged_at AS "acknowledgedAt", acknowledged_by AS "acknowledgedBy"`,
    values
  );
  if (!result.rows[0]) throw new ApiError(404, "ALERT_NOT_FOUND", "Alert not found");
  await writeAudit(req, { auth, action: "ALERT_ACKNOWLEDGED", entityType: "alert", entityId: id });
  res.json({ data: result.rows[0] });
}));

/**
 * Role scope (director: company, head: department, employee: alerts about themselves), and an alert
 * about a deal only for people who can see that deal, including its funnel restrictions.
 */
export function alertVisibility(auth: ReturnType<typeof requireAuth>): { sql: string; values: unknown[] } {
  const values: unknown[] = [auth.companyId];
  const clauses = ["a.company_id = $1"];
  if (auth.role === "MANAGER") { values.push(scopeDepartments(auth)); clauses.push(`a.department_id = ANY($${values.length}::uuid[])`); }
  if (auth.role === "EMPLOYEE") { values.push(auth.userId); clauses.push(`a.user_id = $${values.length}`); }
  const deals = dealScope(auth, values.length + 1);
  values.push(...deals.values);
  clauses.push(`(a.deal_id IS NULL OR EXISTS (SELECT 1 FROM deals d WHERE d.id = a.deal_id AND ${deals.sql}))`);
  return { sql: clauses.join(" AND "), values };
}

function stripTotal(row: Record<string, unknown>): Record<string, unknown> {
  const { totalCount: _total, ...rest } = row;
  return rest;
}

interface OverdueTask { id: string; title: string; boardName: string; dueAt: string }

/**
 * An overdue-tasks alert names its tasks: the ids stored in its evidence, resolved for the caller (only tasks they
 * may open and that are not done, oldest due first), plus how many overdue tasks are not shown.
 */
export async function withOverdueTasks<T extends Record<string, unknown>>(auth: AuthContext, rows: T[]): Promise<Array<T & { tasks?: OverdueTask[]; more?: number }>> {
  const evidenceOf = (row: T) => (row.evidence ?? {}) as { taskIds?: string[]; overdue?: number };
  const overdueRows = rows.filter((row) => row.rule === "TASKS_OVERDUE");
  const ids = [...new Set(overdueRows.flatMap((row) => evidenceOf(row).taskIds ?? []))];
  if (!ids.length) return rows;
  const access = taskAccessSql(auth, "t", 2);
  const found = await query<OverdueTask>(
    `SELECT t.id, t.title, b.name AS "boardName", t.due_at AS "dueAt"
     FROM tasks t JOIN task_boards b ON b.id = t.board_id JOIN task_board_stages s ON s.id = t.stage_id
     WHERE t.id = ANY($1::uuid[]) AND s.category <> 'DONE' AND ${access.sql} ORDER BY t.due_at`,
    [ids, ...access.values]
  );
  const byId = new Map(found.rows.map((task) => [task.id, task]));
  return rows.map((row) => {
    if (row.rule !== "TASKS_OVERDUE") return row;
    const evidence = evidenceOf(row);
    const tasks = (evidence.taskIds ?? []).map((id) => byId.get(id)).filter((task): task is OverdueTask => Boolean(task))
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
    return { ...row, tasks, more: Math.max(0, (evidence.overdue ?? tasks.length) - tasks.length) };
  });
}

