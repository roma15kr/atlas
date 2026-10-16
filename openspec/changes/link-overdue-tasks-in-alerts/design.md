# Design

## Context

- **The data already exists.** The `TASKS_OVERDUE` rule stores `evidence.taskIds` (up to 10, oldest due first) and `evidence.overdue` (the count).
- **The dashboard** selects alerts without their evidence and shows title and summary.
- **Task links** of the form `/tasks?task=<id>` already open a task's dialog for any task the user can see; notifications use them.

## Decisions

1. **Resolve tasks on the server, for the caller.**
   - For `TASKS_OVERDUE` rows, a helper loads `tasks` = `[{ id, title, boardName, dueAt }]` from `evidence.taskIds`.
   - It keeps only tasks that pass `taskAccessSql(auth)` and whose stage category is not `DONE`, ordered by `due_at`.
   - Used by `GET /api/v1/alerts` and the dashboard's five latest alerts: one query per response, `WHERE t.id = ANY(all ids)`.
   - Evidence stays ids-only, as the alert rules require.
2. **«и ещё N».** `more = evidence.overdue - tasks.length` when positive. That covers tasks beyond the ten stored ids and tasks the viewer can't see.
3. **Web.**
   - The alert row gets a «Показать задачи (N)» toggle that opens a list of links (title, board · «срок 12.10»).
   - Each link is a router `Link` to `/tasks?task=<id>`.
   - Demo data gets the same shape for its overdue alert.

## Risks / Trade-offs

- **Stale evidence.** Evidence can be up to one automation run old. Done tasks are filtered out at read time, so the list never shows finished work. The count in the title may lag by one run, which is accepted.
