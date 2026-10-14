# Design

## Context

- **Visibility today:** `taskAccessSql` is board access (director, the board's department or its sub-departments for a head, extra members), or being an assignee. It is used by the list, `accessibleTask`/`scopedTask` (read, update, comments, delete).
- **Dashboard counts** (`dashboard.ts`) count tasks on accessible boards.
- **Other task reads aggregate per person for heads and directors:** reports, AI analysis, alerts, KPIs and achievements. They don't change.
- **No realtime task events exist.**

## Decisions

1. **Data.** `tasks.on_board boolean NOT NULL DEFAULT true` (migration `019_personal_tasks.sql`). Existing tasks stay shared.
2. **Who sees a task.** One SQL predicate in `taskAccessSql`; a DIRECTOR sees every company task. Otherwise a task is visible when any of these hold:
   - `t.on_board` and board access, as today;
   - the caller is an assignee or the author;
   - the caller is a MANAGER and the author's or an assignee's department is in `scopeDepartments(auth)`.
3. **The default for `onBoard`.**
   - **On create**, when `onBoard` is omitted, it is true if any assignee is neither the author nor a DIRECTOR.
   - **On update**, an explicit `onBoard` wins. Otherwise, if the new assignee list adds someone who is neither the author nor a DIRECTOR, `on_board` becomes true; it is never set false implicitly.
   - Outsiders (assignees from other departments, see «Tasks assigned from outside the board») may not change `onBoard`: 403 `TASK_OUTSIDER_FORBIDDEN`, as for the board.
4. **Dashboard counts** use `taskAccessSql` instead of board access alone.
5. **API shape.** Tasks return `onBoard`. The list takes `visibility=personal|board` for the board filter.
6. **Web.**
   - **`TaskDialog`:** a checkbox «Показать на доске». It follows the automatic default until the user touches it, and a hint explains who sees a personal task.
   - **Cards:** a «Личная» badge with a lock.
   - **`BoardsPage`:** a filter «Все / Общие / Личные задачи команды» for heads and directors.
   - **Demo:** `visibleTasks` applies the same rule.
7. **Audit.** Changing `onBoard` is part of `TASK_UPDATED`, with field names only, as today.

## Risks / Trade-offs

- **Visibility depends on assignees.** A head assigned to a personal task of a manager sees it as an assignee anyway. Heads of other departments see a personal task only when someone from their department is author or assignee.
- **A shared task can be flipped to personal by anyone who can edit it.** It then disappears from other board members. That is accepted for a 20-person team; the change is audited.
