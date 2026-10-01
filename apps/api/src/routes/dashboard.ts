import { Router } from "express";
import { requireAuth } from "../auth";
import { query } from "../db";
import { asyncHandler } from "../errors";
import { presenceFor } from "../presence";
import { recordScope } from "../scope";
import { alertVisibility } from "./alerts";
import { dealScope } from "./deals";

export const dashboardRouter = Router();

dashboardRouter.get("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const clientScope = recordScope(auth, { company: "c.company_id", department: "c.department_id", owner: "c.owner_id" });
  const deals = dealScope(auth);
  // Employees see the tasks assigned to them, managers the tasks on their department's boards.
  const taskScope = auth.role === "DIRECTOR"
    ? { sql: "t.company_id = $1", values: [auth.companyId] }
    : auth.role === "MANAGER"
      ? { sql: "t.company_id = $1 AND b.department_id = $2", values: [auth.companyId, auth.departmentId] }
      : { sql: "t.company_id = $1 AND EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = $2)", values: [auth.companyId, auth.userId] };
  const userScope = recordScope(auth, { company: "u.company_id", department: "u.department_id", owner: "u.id" });
  const alertScope = alertVisibility(auth);

  const [clients, pipeline, tasks, alerts, users] = await Promise.all([
    query<{ count: number }>(`SELECT count(*)::int AS count FROM clients c WHERE ${clientScope.sql}`, clientScope.values),
    query<{ total: number; weighted: number; open: number }>(
      `SELECT COALESCE(sum(d.value) FILTER (WHERE ds.outcome = 'OPEN'), 0)::float8 AS total,
              COALESCE(sum(d.value * d.probability / 100.0) FILTER (WHERE ds.outcome = 'OPEN'), 0)::float8 AS weighted,
              count(*) FILTER (WHERE ds.outcome = 'OPEN')::int AS open
       FROM deals d JOIN deal_stages ds ON ds.id = d.stage_id
       WHERE ${deals.sql}`,
      deals.values
    ),
    query<{ total: number; overdue: number; done: number }>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE s.category <> 'DONE' AND t.due_at < now())::int AS overdue,
              count(*) FILTER (WHERE s.category = 'DONE')::int AS done
       FROM tasks t JOIN task_boards b ON b.id = t.board_id JOIN task_board_stages s ON s.id = t.stage_id
       WHERE ${taskScope.sql}`,
      taskScope.values
    ),
    query(
      `SELECT a.id, a.severity, a.category, a.rule, a.title, a.summary, a.deal_id AS "dealId", a.created_at AS "createdAt",
              a.acknowledged_at AS "acknowledgedAt"
       FROM alerts a WHERE ${alertScope.sql} AND a.resolved_at IS NULL ORDER BY a.created_at DESC LIMIT 5`,
      alertScope.values
    ),
    query<{ id: string; fullName: string; jobTitle: string | null }>(
      `SELECT u.id, u.full_name AS "fullName", u.job_title AS "jobTitle"
       FROM users u WHERE ${userScope.sql} AND u.status = 'ACTIVE' ORDER BY u.full_name`,
      userScope.values
    )
  ]);
  const presence = await presenceFor(users.rows.map((user) => user.id));
  res.json({
    data: {
      metrics: {
        clients: clients.rows[0]?.count ?? 0,
        pipelineValue: pipeline.rows[0]?.total ?? 0,
        weightedPipeline: pipeline.rows[0]?.weighted ?? 0,
        currency: "UAH",
        openDeals: pipeline.rows[0]?.open ?? 0,
        tasks: tasks.rows[0] ?? { total: 0, overdue: 0, done: 0 },
        online: Object.keys(presence).length,
        teamSize: users.rowCount
      },
      team: users.rows.map((user) => ({
        ...user,
        presence: presence[user.id] ?? { userId: user.id, status: "OFFLINE", lastSeenAt: null }
      })),
      alerts: alerts.rows
    }
  });
}));
