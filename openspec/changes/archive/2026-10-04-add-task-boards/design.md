# Design

## Context

See proposal.md. Today:
- `tasks` has `status task_status` (TODO, IN_PROGRESS, DONE), a single `assignee_id`, and a `department_id` copied from the assignee.
- Visibility is `recordScope` on `t.assignee_id`, so employees see only their own tasks and managers see their department's.
- `completed_at` is re-stamped on every PATCH that carries `status`.
- The web `TasksPage` shows three hard-coded columns, and `TaskDialog` lives in `DashboardPage.tsx`.

Reports, the dashboard and `ai.ts` count `status = 'DONE'` by `assignee_id`. The funnels change already has the patterns this reuses: a composite foreign key from record to stage to container, an access predicate in `scope.ts`, a config router with a denial-auditing guard, stage deletion with a move target, and settings UI built on `ui-design-system`.

## Goals / Non-Goals

**Goals:**
- Departments run several boards with their own stages, managed by the head or a director.
- Board members see and move all of the board's tasks, and tasks can have several assignees.
- Done and overdue metrics keep working for any custom workflow.

**Non-Goals:**
- Subtasks, checklists, comments, activity feed, tags, a list or table view, custom fields and automations. These are deferred ClickUp features; the user chose only multiple assignees for v1.
- Personal private boards. "Мои задачи" is a cross-board view instead.
- Moving deals-style owner privacy onto tasks. Boards are shared by design.

## Decisions

### 1. Data model (migration `database/005_task_boards.sql`)
- **`task_boards`**: `id`, `company_id`, `department_id` (NULL means a director board; `ON DELETE SET NULL` is avoided with `RESTRICT`, so a department with boards can't vanish silently), `name`, `sort_order`, `created_by`, and timestamps.
  - Unique on `(company_id, department_id, lower(name))`, using `NULLS NOT DISTINCT`.
- **`task_board_members`**: `board_id` (cascade) and `user_id` (cascade), primary key over both.
- **`task_board_stages`**: `id`, `board_id` (cascade), `name`, `color`, `sort_order`, `category` (`CHECK IN ('TODO','ACTIVE','DONE')`).
  - `UNIQUE (id, board_id)`, and unique `(board_id, lower(name))`.
- **`task_assignees`**: `task_id` (cascade) and `user_id` (cascade), primary key over both, plus an index on `user_id`.
- **`tasks`** gains `board_id` and `stage_id` with `FOREIGN KEY (stage_id, board_id) REFERENCES task_board_stages (id, board_id) ON DELETE RESTRICT`, and `board_id → task_boards ON DELETE RESTRICT`.
  - `department_id` is kept and always set from the board, for audit and department reporting.
  - The migration drops `tasks.status`, `tasks.assignee_id` and the `task_status` type.

*Why:* this mirrors funnels, so the database guarantees a task's stage belongs to its board. Separate assignee rows allow several assignees and "tasks assigned to X" queries through an index.

### 2. Access predicates in `scope.ts`
- `boardAccessSql(auth, boardColumn, i)`: `boardColumn IN (SELECT b.id FROM task_boards b WHERE b.company_id = $i AND (<director> OR b.department_id = $dept OR EXISTS member(b.id, $user)))`. A director passes company only.
- `boardManageSql(auth, boardColumn, i)`: a director passes company only; a manager passes `b.department_id = $dept`; employees get `FALSE`.
- Task reads use `boardAccessSql(auth, 't.board_id')` only. They no longer use `recordScope`, because boards are shared.
- "Can user X open board B", for the assignee check, reuses `boardAccessSql` with an `AuthContext` built for X, like `assertOwnerFunnelAccess`.

### 3. Access rules per endpoint

| Endpoint | DIRECTOR | MANAGER | EMPLOYEE |
| --- | --- | --- | --- |
| `GET /api/v1/task-boards` | all company boards | own department + member boards | own department + member boards |
| `POST /task-boards` | any department or none | own department only | 403 + audit |
| `PATCH` / `DELETE /task-boards/:id`, `PUT /task-boards/:id/members`, stage `POST` / `PATCH` / `PUT order` / `DELETE ?moveToStageId=` | any | boards of own department | 403 + audit |
| `GET /tasks`, `GET /tasks/:id` | boards they can open | same | same |
| `POST /tasks`, `PATCH /tasks/:id` | boards they can open; assignees must be able to open the board | same | same |
| `DELETE /tasks/:id` | yes | creator, or manager of the board's department | creator only |

`boardManagerOnly(operation)` middleware writes `TASK_BOARD_CONFIG_DENIED` with the board's department, then returns 403 `BOARD_MANAGER_ONLY`. A board the caller can't open returns 404 before the manager check.

### 4. Task writes
- **Create:**
  1. Resolve the board through `boardAccessSql`, otherwise 404 `BOARD_NOT_FOUND`.
  2. Take the stage from the request, or the first `TODO` stage.
  3. Take `assigneeIds` from the request, deduplicated, defaulting to `[auth.userId]`, max 20.
  4. Check every assignee can open the board, otherwise 403 `ASSIGNEE_BOARD_ACCESS_REQUIRED`.
  5. Insert the task and its assignee rows in one transaction.
- **Patch:** moving to another board requires `stageId` in the target and re-checks assignees against the target board. `completed_at` is recomputed only when the stage changes and the category changes into or out of `DONE`, which fixes today's re-stamp on every drop. `assigneeIds` replaces the set.
- **Deal link:** unchanged (`assertDealVisible` with funnel access). The deal summary is still hidden without funnel access.
- **Audit:** `TASK_CREATED`, `TASK_UPDATED` and `TASK_DELETED` as today. `TASK_UPDATED` metadata includes `boardId` when a task changes board.

### 5. Metrics
- The dashboard uses tasks visible to the viewer: for an employee, tasks assigned to them (the "Мои задачи" meaning); for a manager, tasks on boards of their department; for a director, all.
- Reports and `ai.ts` count per assignee through `task_assignees`, and department reports count distinct tasks on the department's boards. Done means `category = 'DONE'`. The funnel-style viewer gate is not needed for tasks: a report on a person counts that person's tasks.

### 6. Web
- **Navigation:**
  - "Мои задачи" `/tasks`: a cross-board kanban with three category columns (Не начато, В работе, Готово). Cards show the board name as a caption. Dropping a card into a column sends `stageId` = the first stage of that category on the task's board.
  - "Доски" `/boards` (new item after "Мои задачи"): a master–detail-free full-width board. The header has a board switcher (`compact-select` grouped by `<optgroup>` per department), an assignee filter, a priority filter, a settings icon (managers only) and "Новая задача". The kanban uses the board's stages; the column header shows the colored marker, the name, a count and a category badge for DONE.
  - "Настройки доски" `/boards/:id/settings`: the `ui-design-system` settings pattern. The list holds the boards the user manages. Detail cards: a summary (department, counts), stages (category badges), and members (department members listed read-only, plus "Изменить участников" dialog for extra members).
- **Shared components:** `StageDialog`, `DeleteStageDialog`, stage rows and `NameDialog` move from `FunnelSettingsPage.tsx` to `components/stageSettings.tsx`, parameterized by the category/outcome option list. Both settings screens use them.
- **Task dialog:** moves to `components/TaskDialog.tsx` (md). Fields: title, description, board and stage selects, due date, priority, and an "Исполнители" checklist of the board's users with the current user preselected.
- **Cards:** show up to 3 stacked `Avatar sm`, then "+N".
- **Data:** `AppContext` loads `/task-boards` and all task pages through `listAll('tasks')`. `WorkTask` gains `boardId`, `stage` and `assignees[]` and loses `status` and `assigneeId`.

### 7. Migration steps (one transaction)
1. Create the tables.
2. Insert "Задачи отдела" per department, with its three stages.
3. Insert one director board "Задачи руководства" per company that has department-less tasks.
4. Backfill `tasks.board_id` and `stage_id` from department and status.
5. Copy `assignee_id` into `task_assignees`.
6. Add each department-less task's assignee as a member of the director board.
7. Set the new columns `NOT NULL`, add the constraints, and drop the old columns and type.

The seed file (002) runs before 005 and is backfilled the same way.

## Risks / Trade-offs

- **Employees start seeing their department's tasks.** This is intended (the user chose shared boards), but it's a real privacy change. → Call it out in the release note. Heads can create boards with a department-less or restricted audience (a director board with members) for sensitive work.
- **Anyone on a board can reassign or move others' tasks.** → Every change is audited with the actor, and deletion stays restricted. A "task permissions" setting can come later if needed.
- **Irreversible migration.** It drops `status` and `assignee_id`. → Same approach as funnels: a pre-deploy dump (documented in OPERATIONS), verified on the test app first.
- **More queries per page.** Loading all tasks for "Мои задачи" and the boards could grow. → `listAll` pages at 100. There are indexes on `task_assignees(user_id)` and `tasks(board_id, stage_id)`, and the volume for about 20 people is small.

## Implementation notes

Decisions made during implementation that refine the plan above:
- **Two read endpoints were added.**
  - `GET /task-boards/:id/users` lists everyone who can open a board, for any viewer of the board. The assignee checklist needs it, because employees only see themselves in `/team`.
  - `GET /task-boards/:id/candidates` lists active non-director users of the company, for board managers only. A department head needs it to invite people from other departments.
- **New departments get the default board from a database trigger** (`departments_default_task_board`), so both onboarding paths (`/team` and bootstrap) are covered.
- **Changing a stage's category** into or out of `DONE` sets or clears `completed_at` for the tasks in that stage, as a stage deletion with a move does.
- **`writeAudit` keeps an explicit `departmentId: null`.** It no longer falls back to the actor's department, so director-board events are not shown to the head of the director's own department.
- **Column headers** show the category as the caption under the stage name instead of a separate DONE badge, which repeated the default "Готово" stage name.
- **Tasks and the settings screen** open task details from a card click. The task dialog also edits tasks and offers deletion to the creator or a board manager.
