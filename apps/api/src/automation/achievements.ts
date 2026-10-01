import { writeAutomationAudit } from "../audit";
import { query } from "../db";
import { emitToUsers } from "../realtime";

interface Award { user_id: string; company_id: string; department_id: string | null; code: string; name: string; points: number }

/** Kyiv calendar helpers in SQL, so the database clock decides month boundaries. */
const KYIV_TODAY = "COALESCE($2::date, (now() AT TIME ZONE 'Europe/Kyiv')::date)";
const PREVIOUS_MONTH_START = `(date_trunc('month', ${KYIV_TODAY}) - interval '1 month')::date`;
const MONTH_START = `date_trunc('month', ${KYIV_TODAY})::date`;

/** Candidates per achievement; each query returns the user and the achievement definition to award. */
const rules: Record<string, string> = {
  // The person's last 10 completed tasks that had a due date were all done on time.
  ON_TIME_10: `
    SELECT u.id AS user_id FROM users u
    WHERE u.status = 'ACTIVE' AND (
      SELECT count(*) FILTER (WHERE recent.completed_at <= recent.due_at) = 10 AND count(*) = 10
      FROM (SELECT t.completed_at, t.due_at FROM tasks t JOIN task_assignees ta ON ta.task_id = t.id
            WHERE ta.user_id = u.id AND t.completed_at IS NOT NULL AND t.due_at IS NOT NULL
            ORDER BY t.completed_at DESC LIMIT 10) recent)`,
  // Previous calendar month: at least 5 assigned tasks were due, all finished by their due date.
  ZERO_OVERDUE: `
    SELECT ta.user_id FROM tasks t JOIN task_assignees ta ON ta.task_id = t.id JOIN users u ON u.id = ta.user_id
    WHERE u.status = 'ACTIVE'
      AND (t.due_at AT TIME ZONE 'Europe/Kyiv')::date >= ${PREVIOUS_MONTH_START}
      AND (t.due_at AT TIME ZONE 'Europe/Kyiv')::date < ${MONTH_START}
    GROUP BY ta.user_id
    HAVING count(*) >= 5 AND bool_and(t.completed_at IS NOT NULL AND t.completed_at <= t.due_at)`,
  // On the 1st of a month: the highest rating above 0 among active non-directors of each company.
  TOP_MONTH: `
    WITH ratings AS (
      SELECT u.id, u.company_id, round(sum(LEAST(k.actual / NULLIF(k.target, 0), 1.2) * k.weight) / NULLIF(sum(k.weight), 0) * 100) AS rating
      FROM users u JOIN kpis k ON k.user_id = u.id
      WHERE u.status = 'ACTIVE' AND u.role <> 'DIRECTOR'
      GROUP BY u.id, u.company_id
    )
    SELECT r.id AS user_id FROM ratings r
    WHERE extract(day FROM ${KYIV_TODAY}) = 1 AND r.rating > 0
      AND r.rating = (SELECT max(other.rating) FROM ratings other WHERE other.company_id = r.company_id)`
};

/**
 * Awards every earned achievement once, audits it and tells the person. Returns the new awards.
 * `today` (YYYY-MM-DD, Kyiv) overrides the calendar date for tests.
 */
export async function awardAchievements(today?: string): Promise<Award[]> {
  const awarded: Award[] = [];
  for (const [code, candidates] of Object.entries(rules)) {
    const result = await query<Award>(
      `WITH candidates AS (${candidates}),
       inserted AS (
         INSERT INTO user_achievements (user_id, achievement_id)
         SELECT c.user_id, ad.id FROM candidates c JOIN users u ON u.id = c.user_id
         JOIN achievement_definitions ad ON ad.company_id = u.company_id AND ad.code = $1
         WHERE $2::date IS NULL OR $2::date IS NOT NULL -- every rule receives the date, not all use it
         ON CONFLICT (user_id, achievement_id) DO NOTHING
         RETURNING user_id, achievement_id
       )
       SELECT i.user_id, u.company_id, u.department_id, ad.code, ad.name, ad.points
       FROM inserted i JOIN users u ON u.id = i.user_id JOIN achievement_definitions ad ON ad.id = i.achievement_id`,
      [code, today ?? null]
    );
    awarded.push(...result.rows);
  }
  for (const award of awarded) {
    await writeAutomationAudit(award.company_id, {
      action: "ACHIEVEMENT_AWARDED", entityType: "user", entityId: award.user_id, departmentId: award.department_id, metadata: { code: award.code }
    });
    emitToUsers([award.user_id], "achievement:awarded", { code: award.code, name: award.name, points: award.points });
  }
  return awarded;
}
