import { query } from "../db";

export const ALERT_RULES = ["TASKS_OVERDUE", "DEAL_CLOSE_OVERDUE", "DEAL_STALLED", "KPI_BEHIND", "INACTIVITY"] as const;
export type AlertRule = typeof ALERT_RULES[number];

const KYIV_TODAY = "(now() AT TIME ZONE 'Europe/Kyiv')::date";

/**
 * Each rule selects the conditions that hold right now, one row per subject, with columns
 * company_id, dedupe_key, severity, user_id, department_id, deal_id, category, title, summary, evidence.
 * Only ACTIVE users are considered; evidence holds counts, ids and dates only.
 */
const rules: Record<AlertRule, string> = {
  TASKS_OVERDUE: `
    SELECT u.company_id, 'tasks_overdue:' || u.id AS dedupe_key,
           CASE WHEN count(*) >= 6 THEN 'CRITICAL' ELSE 'WARNING' END AS severity,
           u.id AS user_id, u.department_id, NULL::uuid AS deal_id, 'DEADLINES' AS category,
           'Просроченные задачи' AS title,
           u.full_name || ': просрочено задач — ' || count(*) AS summary,
           jsonb_build_object('overdue', count(*), 'taskIds', (array_agg(t.id ORDER BY t.due_at))[1:10], 'oldestDueAt', min(t.due_at)) AS evidence
    FROM tasks t JOIN task_board_stages s ON s.id = t.stage_id
    JOIN task_assignees ta ON ta.task_id = t.id JOIN users u ON u.id = ta.user_id
    WHERE u.status = 'ACTIVE' AND s.category <> 'DONE' AND t.due_at < now()
    GROUP BY u.id HAVING count(*) >= 3`,
  DEAL_CLOSE_OVERDUE: `
    SELECT d.company_id, 'deal_close:' || d.id AS dedupe_key, 'WARNING' AS severity,
           d.owner_id AS user_id, d.department_id, d.id AS deal_id, 'PIPELINE' AS category,
           'Сделка не закрыта в срок' AS title,
           '«' || d.title || '» — ожидаемая дата закрытия прошла' AS summary,
           jsonb_build_object('expectedCloseAt', d.expected_close_at, 'stageId', d.stage_id) AS evidence
    FROM deals d JOIN deal_stages s ON s.id = d.stage_id JOIN users u ON u.id = d.owner_id
    WHERE u.status = 'ACTIVE' AND s.outcome = 'OPEN' AND d.expected_close_at::date < ${KYIV_TODAY}`,
  DEAL_STALLED: `
    SELECT d.company_id, 'deal_stalled:' || d.id AS dedupe_key, 'INFO' AS severity,
           d.owner_id AS user_id, d.department_id, d.id AS deal_id, 'PIPELINE' AS category,
           'Сделка без движения' AS title,
           '«' || d.title || '» не менялась ' || (current_date - d.updated_at::date) || ' дн.' AS summary,
           jsonb_build_object('updatedAt', d.updated_at, 'stageId', d.stage_id) AS evidence
    FROM deals d JOIN deal_stages s ON s.id = d.stage_id JOIN users u ON u.id = d.owner_id
    WHERE u.status = 'ACTIVE' AND s.outcome = 'OPEN' AND d.updated_at < now() - interval '14 days'`,
  KPI_BEHIND: `
    SELECT u.company_id, 'kpi_behind:' || k.id AS dedupe_key, 'WARNING' AS severity,
           u.id AS user_id, u.department_id, NULL::uuid AS deal_id, 'KPI' AS category,
           'KPI отстаёт от плана' AS title,
           u.full_name || ': «' || k.name || '» — ' || round(100 * k.actual / k.target) || '% при прошедших ' || round(100 * e.elapsed) || '% периода' AS summary,
           jsonb_build_object('kpiId', k.id, 'progress', round(k.actual / k.target, 3), 'elapsed', round(e.elapsed, 3)) AS evidence
    FROM kpis k JOIN users u ON u.id = k.user_id
    CROSS JOIN LATERAL (SELECT (${KYIV_TODAY} - k.period_start + 1)::numeric / (k.period_end - k.period_start + 1) AS elapsed) e
    WHERE u.status = 'ACTIVE' AND k.period_start IS NOT NULL AND k.target > 0
      AND ${KYIV_TODAY} <= k.period_end AND e.elapsed >= 0.5 AND k.actual / k.target < e.elapsed - 0.3`,
  // Presence is looked at only for people who accepted the monitoring policy.
  INACTIVITY: `
    SELECT u.company_id, 'inactivity:' || u.id AS dedupe_key, 'INFO' AS severity,
           u.id AS user_id, u.department_id, NULL::uuid AS deal_id, 'PRESENCE' AS category,
           'Нет активности в Atlas' AS title,
           u.full_name || ': нет активности в Atlas ' || gap.weekdays || ' рабочих дн.' AS summary,
           jsonb_build_object('lastOnlineAt', last.at, 'weekdays', gap.weekdays) AS evidence
    FROM users u
    CROSS JOIN LATERAL (SELECT max(occurred_at) AS at FROM presence_events pe WHERE pe.user_id = u.id AND pe.event = 'ONLINE') last
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS weekdays FROM generate_series(
        (COALESCE(last.at, u.created_at) AT TIME ZONE 'Europe/Kyiv')::date + 1, ${KYIV_TODAY} - 1, interval '1 day') day
      WHERE extract(isodow FROM day) < 6) gap
    WHERE u.status = 'ACTIVE' AND u.monitoring_consent_at IS NOT NULL
      AND u.created_at < now() - interval '3 days' AND gap.weekdays >= 3`
};

export interface AlertEvaluation { created: number; updated: number; resolved: number }

/** Brings every rule's open alerts in line with the conditions that hold now. */
export async function evaluateAlerts(): Promise<AlertEvaluation> {
  const totals: AlertEvaluation = { created: 0, updated: 0, resolved: 0 };
  for (const [rule, conditions] of Object.entries(rules)) {
    const upserted = await query<{ inserted: boolean }>(
      `INSERT INTO alerts (company_id, department_id, user_id, deal_id, severity, category, title, summary, evidence, rule, dedupe_key)
       SELECT c.company_id, c.department_id, c.user_id, c.deal_id, c.severity, c.category, c.title, c.summary, c.evidence, $1, c.dedupe_key
       FROM (${conditions}) c
       ON CONFLICT (company_id, dedupe_key) WHERE dedupe_key IS NOT NULL AND resolved_at IS NULL
       DO UPDATE SET severity = EXCLUDED.severity, summary = EXCLUDED.summary, evidence = EXCLUDED.evidence,
                     title = EXCLUDED.title, department_id = EXCLUDED.department_id
       WHERE alerts.severity IS DISTINCT FROM EXCLUDED.severity OR alerts.evidence IS DISTINCT FROM EXCLUDED.evidence
          OR alerts.summary IS DISTINCT FROM EXCLUDED.summary
       RETURNING (xmax = 0) AS inserted`,
      [rule]
    );
    totals.created += upserted.rows.filter((row) => row.inserted).length;
    totals.updated += upserted.rows.filter((row) => !row.inserted).length;
    const resolved = await query(
      `UPDATE alerts a SET resolved_at = now()
       WHERE a.rule = $1 AND a.resolved_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM (${conditions}) c WHERE c.company_id = a.company_id AND c.dedupe_key = a.dedupe_key)`,
      [rule]
    );
    totals.resolved += resolved.rowCount ?? 0;
  }
  return totals;
}
