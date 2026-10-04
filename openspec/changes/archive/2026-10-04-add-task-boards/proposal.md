# Proposal

## Why

Tasks today are one private three-column board per person, with fixed statuses (TODO, IN_PROGRESS, DONE) and exactly one assignee. Teams can't organize work by project or process, can't see each other's tasks, and can't adapt the columns to how a department actually works. The sales side now has configurable funnels. Work management should get the same flexibility, closer to how ClickUp organizes work: departments own several boards, each board has its own statuses, and tasks can be shared by several people.

## What Changes

- **Task boards.** A department can have several boards, each with its own ordered stages. Each stage has a name, a color and a **category**: `TODO` ("Не начато"), `ACTIVE` ("В работе") or `DONE` ("Готово"). The category replaces the fixed task statuses. Every task belongs to exactly one board and one of its stages.
- **Who manages boards.** Directors manage every board. A department head (MANAGER) manages the boards of their own department: they create, rename and delete boards, add, edit, reorder and delete stages, and choose extra members. Deleting a stage that holds tasks moves them to a chosen stage of the same board in one step, as with funnels. Employees can't configure boards, and denied attempts are audited.
- **Board access.** A board belongs to one department. It is visible to that department's members, to directors, and to individually added members from other departments. A board without a department is a director board, visible to directors and its members.
- **Shared tasks inside a board.** **BREAKING (visibility)**: everyone with access to a board sees all of its tasks, and any board member can create tasks, move them between stages, edit them, and assign any people who have access to the board. Today employees see only their own tasks. Deleting a task stays with its creator and with the board's managers.
- **Multiple assignees.** A task can have one or more assignees, each of whom must have access to its board.
- **"Мои задачи"** becomes a cross-board view of the tasks assigned to me. It groups tasks into three columns by stage category. Dropping a card into a column moves it to the first stage of that category on the task's own board.
- **A new "Доски задач" screen:** a board switcher grouped by department, a kanban board with the board's stages, filters by assignee and priority, and a "Новая задача" dialog with board, stage and several assignees. Directors and heads also get a board settings screen that follows the `ui-design-system` settings pattern and reuses the funnel stage components.
- **Completion.** `completed_at` is set when a task enters a `DONE` stage and cleared when it leaves one. Reports, the dashboard and AI count done and overdue tasks by stage category and count a task for each of its assignees.
- **BREAKING (API)**: task payloads use `boardId`, `stageId` and `assigneeIds` instead of `status` and `assigneeId`. New `/api/v1/task-boards` endpoints. The web app is the only client.
- **Migration.** Every department gets a "Задачи отдела" board with the stages "Нужно сделать" (TODO), "В работе" (ACTIVE) and "Готово" (DONE). Existing tasks move onto their department's board with their status mapped to the matching stage and their assignee kept. Tasks without a department go to one director board per company, with their assignees added as members.

## Capabilities

### New Capabilities
- `task-boards`: department boards, stage configuration with categories, board membership and access, the manager-or-director configuration rules, and stage deletion with task relocation.

### Modified Capabilities
- `tasks`: task records gain a board, a stage and several assignees; visibility follows board access; completion follows the stage category; listing filters by board, stage and assignee, including a "mine" view.
- `reports`: task metrics count by stage category and by assignee membership.
- `audit-log`: board, stage and membership changes and denied configuration attempts are audited.

## Impact

- **Database:** migration `005_task_boards.sql` adds `task_boards`, `task_board_members`, `task_board_stages` and `task_assignees`, adds `board_id` and `stage_id` (composite foreign key) to `tasks`, backfills them, then drops `tasks.status`, `tasks.assignee_id` and the `task_status` type.
- **API:** new `routes/taskBoards.ts` and a board-access predicate in `scope.ts`. Changes to `routes/tasks.ts`, `routes/dashboard.ts`, `routes/reports.ts` and `ai.ts`.
- **Web:** new `TaskBoardsPage` and `TaskBoardSettingsPage`, a reworked `TasksPage` ("Мои задачи") and `TaskDialog`, plus `AppContext`, `types`, demo data and navigation. The funnel settings stage components are extracted so both settings screens share them.
- **Depends on** `add-multiple-crm-funnels` (its settings components) and `add-ui-design-system` (screen rules). Ships on the same branch.
