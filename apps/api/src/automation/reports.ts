import { writeAutomationAudit } from "../audit";
import { query } from "../db";
import { reportMetrics } from "../routes/reports";
import type { AuthContext, Role } from "../types";

interface DueReport {
  id: string; company_id: string; department_id: string | null; target_user_id: string | null; schedule: string;
  created_by: string; creator_role: Role; creator_status: string; creator_department: string | null; creator_username: string;
  period_start: string; period_end: string;
}

/** The latest complete period for a schedule, in Kyiv dates: yesterday, last Monday–Sunday or last month. */
const PERIOD_SQL = `
  CASE r.schedule
    WHEN 'DAILY' THEN today - 1
    WHEN 'WEEKLY' THEN date_trunc('week', today)::date - 7
    ELSE (date_trunc('month', today) - interval '1 month')::date END AS period_start,
  CASE r.schedule
    WHEN 'DAILY' THEN today - 1
    WHEN 'WEEKLY' THEN date_trunc('week', today)::date - 1
    ELSE (date_trunc('month', today) - interval '1 day')::date END AS period_end`;

/**
 * Runs every active recurring report that is due, once, for its latest complete period, with the
 * creator's access scope. A creator who is no longer an active director or head pauses the schedule.
 */
export async function runDueReports(): Promise<number> {
  const due = await query<DueReport>(
    `SELECT r.id, r.company_id, r.department_id, r.target_user_id, r.schedule, r.created_by,
            u.role AS creator_role, u.status AS creator_status, u.department_id AS creator_department, u.username AS creator_username,
            to_char(p.period_start, 'YYYY-MM-DD') AS period_start, to_char(p.period_end, 'YYYY-MM-DD') AS period_end
     FROM reports r JOIN users u ON u.id = r.created_by
     CROSS JOIN LATERAL (SELECT (now() AT TIME ZONE 'Europe/Kyiv')::date AS today) t
     CROSS JOIN LATERAL (SELECT ${PERIOD_SQL.replaceAll("today", "t.today")}) p
     WHERE r.active AND r.schedule <> 'ONCE' AND r.next_run_at <= now()
     ORDER BY r.next_run_at LIMIT 50`
  );
  let ran = 0;
  for (const report of due.rows) {
    if (report.creator_status !== "ACTIVE" || report.creator_role === "EMPLOYEE") {
      await query("UPDATE reports SET active = false WHERE id = $1", [report.id]);
      await writeAutomationAudit(report.company_id, {
        action: "REPORT_SCHEDULE_PAUSED", entityType: "report", entityId: report.id, departmentId: report.department_id, metadata: { reason: "creator_unavailable" }
      });
      continue;
    }
    const creator: AuthContext = {
      userId: report.created_by, companyId: report.company_id, departmentId: report.creator_department, username: report.creator_username, role: report.creator_role
    };
    const result = await reportMetrics(creator, report.company_id, report.target_user_id, report.target_user_id ? null : report.department_id, report.period_start, report.period_end);
    const run = await query<{ id: string }>(
      `INSERT INTO report_runs (report_id, company_id, period_start, period_end, result) VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
      [report.id, report.company_id, report.period_start, report.period_end, JSON.stringify(result)]
    );
    await query(
      `UPDATE reports SET result = $2::jsonb, period_start = $3, period_end = $4, status = 'READY',
         last_run_at = now(), next_run_at = report_next_run(schedule::text, now())
       WHERE id = $1`,
      [report.id, JSON.stringify(result), report.period_start, report.period_end]
    );
    await writeAutomationAudit(report.company_id, {
      action: "REPORT_RUN_COMPLETED", entityType: "report", entityId: report.id, departmentId: report.department_id,
      metadata: { runId: run.rows[0]!.id, periodStart: report.period_start, periodEnd: report.period_end }
    });
    ran += 1;
  }
  return ran;
}
