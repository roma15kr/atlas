# Tasks

## 1. Database

- [x] 1.1 Write `database/005_task_boards.sql` (tables, constraints, indexes and backfill per design §7). Verify on PGlite with the demo seed:
  - each department has "Задачи отдела" with 3 stages
  - task counts per status equal task counts per mapped stage
  - assignees and `completed_at` are preserved
  - department-less tasks land on a director board with their assignees as members
  - a fresh database with no companies migrates cleanly
- [x] 1.2 Verify the invariants with SQL on PGlite:
  - a task can't use a stage of another board
  - a stage or board with tasks can't be deleted
  - stage names are unique per board, ignoring case
  - the category is constrained

## 2. Access predicates

- [x] 2.1 Add `boardAccessSql` and `boardManageSql` to `scope.ts`, plus an access check for an arbitrary user in `access.ts`. Verify with unit tests for each role, member access, director boards and parameter numbering.

## 3. Task board API

- [x] 3.1 Create `routes/taskBoards.ts`:
  - list with stages, task counts and `canManage`, plus members for managers
  - create, rename and delete (`BOARD_NOT_EMPTY`)
  - members `PUT`
  - stage create, patch, order and delete with `moveToStageId`
  - a `boardManagerOnly` guard that audits denials with the department

  Mount it at `/api/v1/task-boards`. Verify with unit tests for the schemas, the category guard (TODO and DONE required) and the guard's audit call.
- [x] 3.2 Rework `routes/tasks.ts`:
  - board access instead of assignee scope
  - `boardId`, `stageId` and `assigneeIds` input
  - the default stage and default assignee
  - the assignee board check
  - `completed_at` only on category change
  - move between boards
  - delete permission
  - filters (`boardId`, `stageId`, `category`, `priority`, `dealId`, `assignee=me|id`)
  - response with the stage summary and assignees

  Verify with unit tests for the input schema and completion logic.
- [x] 3.3 Update `routes/dashboard.ts`, `routes/reports.ts` and `ai.ts` to count by stage category and `task_assignees` (design §5). Verify by comparing report and dashboard numbers on PGlite with a hand count.
- [x] 3.4 Run the API suite and an end-to-end scenario script against the real API on PGlite:
  - a head creates a board
  - an employee sees a colleague's task
  - an outsider gets 404
  - a cross-department member is added
  - an assignee without access gets 403
  - custom stages, and deleting a stage with a move
  - `completed_at` behavior
  - delete permissions
  - audit events

  Verify all checks pass.

## 4. Web

- [x] 4.1 Extract the shared stage settings components from `FunnelSettingsPage.tsx` into `components/stageSettings.tsx`, parameterized by the category option list. Verify the existing funnel settings tests still pass.
- [x] 4.2 Update `types.ts`, `AppContext.tsx` (task boards loading, `listAll('tasks')`, the new task actions, board config actions with demo fallbacks) and `data/demo.ts` (two Sales boards, a cross-department member, tasks with multiple assignees). Verify with `npm run typecheck --workspace @atlas/web`.
- [x] 4.3 Move `TaskDialog` to `components/TaskDialog.tsx` with board, stage and assignee checklist fields, and rebuild "Мои задачи" as the cross-board category view. Verify with component tests: a drop moves a card to the first stage of that category, and the dialog preselects the current user.
- [x] 4.4 Add the `/boards` page (switcher grouped by department, kanban with the board's stages, assignee and priority filters, stacked assignee avatars) and the navigation item. Verify with a test: switching boards changes the columns, and an employee sees a colleague's task.
- [x] 4.5 Add `/boards/:id/settings` (settings pattern, shared stage components, members dialog), visible to directors and department heads. Verify with tests: an employee is redirected and a head can add a stage. Screenshot the board, "Мои задачи" and the settings with headless Chromium and check them against `ui-design-system`.

## 5. Documentation

- [x] 5.1 Update `docs/ARCHITECTURE.md` (data model and board access), `README.md` (features), `docs/OPERATIONS.md` (pre-deploy dump for 005) and the onboarding README note (boards and shared visibility). Verify the text matches the endpoints.

## 6. Integration check

- [x] 6.1 Run `npm run typecheck && npm test && npm run build` and verify all pass.
- [x] 6.2 Commit, push, deploy to the Coolify test app, and run the end-to-end scenarios against it. Verify all pass and the existing funnels suite still passes.
- [x] 6.3 Run `openspec validate add-task-boards --strict` and verify it passes.
