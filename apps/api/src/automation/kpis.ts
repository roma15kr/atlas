import { query } from "../db";

export const KPI_SOURCES = ["MANUAL", "DEALS_WON_VALUE", "DEALS_WON_COUNT", "TASKS_DONE", "TASKS_ON_TIME_RATE"] as const;
export type KpiSource = typeof KPI_SOURCES[number];

/** Automatic KPIs measure in a fixed unit. */
export const KPI_SOURCE_UNITS: Record<Exclude<KpiSource, "MANUAL">, string> = {
  DEALS_WON_VALUE: "UAH",
  DEALS_WON_COUNT: "сделок",
  TASKS_DONE: "задач",
  TASKS_ON_TIME_RATE: "%"
};

/** The SQL that measures one automatic source for KPI row `k` over its period. */
const measures: Record<Exclude<KpiSource, "MANUAL">, string> = {
  DEALS_WON_VALUE: `(SELECT COALESCE(sum(d.value), 0) FROM deals d JOIN deal_stages s ON s.id = d.stage_id
     WHERE d.owner_id = k.user_id AND s.outcome = 'WON' AND d.closed_at::date BETWEEN k.period_start AND k.period_end)`,
  DEALS_WON_COUNT: `(SELECT count(*) FROM deals d JOIN deal_stages s ON s.id = d.stage_id
     WHERE d.owner_id = k.user_id AND s.outcome = 'WON' AND d.closed_at::date BETWEEN k.period_start AND k.period_end)`,
  TASKS_DONE: `(SELECT count(*) FROM tasks t JOIN task_assignees ta ON ta.task_id = t.id
     WHERE ta.user_id = k.user_id AND t.completed_at::date BETWEEN k.period_start AND k.period_end)`,
  // Tasks due in the period that are finished or already late; open tasks past due count as late.
  TASKS_ON_TIME_RATE: `(SELECT COALESCE(round(100.0 * count(*) FILTER (WHERE t.completed_at IS NOT NULL AND t.completed_at <= t.due_at)
       / NULLIF(count(*), 0), 2), 0)
     FROM tasks t JOIN task_assignees ta ON ta.task_id = t.id
     WHERE ta.user_id = k.user_id AND t.due_at::date BETWEEN k.period_start AND k.period_end
       AND (t.completed_at IS NOT NULL OR t.due_at < now()))`
};

/**
 * Recomputes automatic KPIs whose period is current or ended within the last 2 days; older periods
 * stay frozen. Limited to the given KPI ids when provided.
 */
export async function recomputeKpis(kpiIds?: string[]): Promise<number> {
  let updated = 0;
  for (const [source, measure] of Object.entries(measures)) {
    const result = await query(
      `UPDATE kpis k SET actual = ${measure}, computed_at = now()
       WHERE k.source = $1
         AND ($2::uuid[] IS NULL OR k.id = ANY($2::uuid[]))
         AND k.period_start <= current_date AND k.period_end >= current_date - 2`,
      [source, kpiIds ?? null]
    );
    updated += result.rowCount ?? 0;
  }
  return updated;
}
