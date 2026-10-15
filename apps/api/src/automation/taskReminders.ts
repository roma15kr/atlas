import { query } from "../db";
import { notify } from "../notifications/notify";

const REMINDER_HOUR = 8;
const RETENTION_DAYS = 90;

interface DueTask { id: string; company_id: string; title: string; due_on: string; assignee_ids: string[] }

/** The Kyiv calendar date and hour of `now`. */
function kyiv(now: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, hour: Number(part("hour")) };
}

/**
 * After 08:00 Kyiv time, reminds assignees of open tasks due today and of overdue ones, once per task, kind and
 * due date; deletes notifications older than 90 days.
 */
export async function runTaskReminders(now = new Date()): Promise<{ due: number; overdue: number }> {
  await query("DELETE FROM notifications WHERE created_at < $1::timestamptz - make_interval(days => $2)", [now.toISOString(), RETENTION_DAYS]);
  await query("DELETE FROM task_due_notices WHERE due_on < $1::date - 60", [kyiv(now).date]);
  const today = kyiv(now);
  if (today.hour < REMINDER_HOUR) return { due: 0, overdue: 0 };
  const remind = async (kind: "TASK_DUE" | "TASK_OVERDUE", comparison: "=" | "<") => {
    const tasks = await query<DueTask>(
      `WITH candidates AS (
         SELECT t.id, t.company_id, t.title, (t.due_at AT TIME ZONE 'Europe/Kyiv')::date::text AS due_on
         FROM tasks t JOIN task_board_stages s ON s.id = t.stage_id
         WHERE s.category <> 'DONE' AND t.due_at IS NOT NULL AND (t.due_at AT TIME ZONE 'Europe/Kyiv')::date ${comparison} $1::date
       ), claimed AS (
         INSERT INTO task_due_notices (task_id, kind, due_on) SELECT id, $2, due_on::date FROM candidates
         ON CONFLICT DO NOTHING RETURNING task_id
       )
       SELECT c.id, c.company_id, c.title, c.due_on, ARRAY(SELECT ta.user_id::text FROM task_assignees ta WHERE ta.task_id = c.id) AS assignee_ids
       FROM candidates c JOIN claimed ON claimed.task_id = c.id`,
      [today.date, kind]
    );
    for (const task of tasks.rows) {
      await notify(task.company_id, task.assignee_ids, null, {
        kind, title: kind === "TASK_DUE" ? `Срок сегодня: ${task.title}` : `Просрочена задача: ${task.title}`,
        body: kind === "TASK_DUE" ? "Задачу нужно закончить сегодня" : `Срок был ${task.due_on.split("-").reverse().join(".")}`,
        link: `/tasks?task=${task.id}`, entityType: "task", entityId: task.id
      });
    }
    return tasks.rowCount ?? 0;
  };
  return { due: await remind("TASK_DUE", "="), overdue: await remind("TASK_OVERDUE", "<") };
}
