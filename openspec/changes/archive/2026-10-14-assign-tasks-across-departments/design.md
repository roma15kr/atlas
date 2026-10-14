# Design

## Context

See proposal.md (Why) and the spec delta. From the code:

- **Assignee check.** `assertAssigneesBoardAccess` (`access.ts`) refuses assignees who fail `boardUserAccessSql`. It runs from `POST /tasks` and from `PATCH /tasks/:id`, both when assignees change and when the board changes.
- **Task reads go through `boardAccessSql`:** the task list (`routes/tasks.ts` `GET /`), `scopedTask` (single task, task comments) and the update/delete helpers. The dashboard counts tasks by board department.
- **The picker.** The web task dialog fills assignees from `taskBoardConfig.boardUsers(boardId)`, which returns board users only.

## Goals / Non-Goals

**Goals:**
- One rule, «may open this task» = can open the board **or** is an assignee, used by every task read and write.
- An outsider's rights are a strict subset of a board user's.

**Non-Goals:**
- Changing board access or membership.
- Notifications.
- Showing outsiders anything about the board beyond their task and its stage list.

## Decisions

1. **`taskAccessSql(auth, taskAlias, start)`** in `scope.ts`: `boardAccessSql(...)` OR `EXISTS (SELECT 1 FROM task_assignees WHERE task_id = <task>.id AND user_id = <caller>)`. Directors already pass `boardAccessSql`.
   - Used by: the task list, `scopedTask` (and therefore task comments), stage moves and edits.
   - Task *creation* keeps `boardAccessSql` on the target board.
2. **What an outsider may do.** `scopedTask` returns `viaAssignment: true` when the caller can't open the board. Then `PATCH /tasks/:id`:
   - **allows** title, description, priority, due date and `stageId` within the same board;
   - **refuses** `boardId` and `assigneeIds` with 403 `TASK_OUTSIDER_FORBIDDEN`.

   `DELETE` follows the existing creator-or-board-manager rule, so an outsider who isn't the creator gets 403. Refusals are audited as `TASK_UPDATE_DENIED`.
3. **Assignee validation** becomes «ACTIVE user of the same company»: `assertAssignableUsers(companyId, ids)` → 400 `INVALID_ASSIGNEE`. It replaces `assertAssigneesBoardAccess` in `routes/tasks.ts`. `boardUserAccessSql` stays for board-member checks.
4. **The picker.** `GET /api/v1/tasks/assignable-users` returns all ACTIVE company users (id, fullName, departmentName, jobTitle, avatarUrl), for any signed-in user. The task dialog groups them by department, the board's department first, with search. Demo mode uses the demo users.
5. **The stage list for outsiders.** A task response already carries a stage summary. For the stage select, `GET /tasks/:id` adds `boardStages` (id, name, category, sort order) when `viaAssignment`, so the dialog can offer the move without opening the board.

**Access rules:**
- **DIRECTOR:** unchanged (all boards).
- **MANAGER and EMPLOYEE:** unchanged for boards they can open, plus their own assigned tasks on other boards.
- **Assignable users:** any ACTIVE user of the same company.

**Migrations:** none.

**Audit events:** `TASK_UPDATE_DENIED` (new; metadata: fields). `TASK_CREATED` and `TASK_UPDATED` are unchanged.

### Files

| File | Change |
|---|---|
| `apps/api/src/scope.ts` | `taskAccessSql` |
| `apps/api/src/access.ts` | `assertAssignableUsers` |
| `apps/api/src/routes/tasks.ts` | list/scopedTask via `taskAccessSql`; outsider limits; assignable-users; `boardStages` |
| `apps/web/src/components/TaskDialog.tsx` | company-wide grouped picker; outsider mode (no board change, assignees read-only, stages from `boardStages`) |
| `apps/web/src/context/AppContext.tsx` | `assignableUsers()` with demo branch |

### Types and signatures

```ts
export function taskAccessSql(auth: AuthContext, taskAlias: string, startIndex?: number): ScopeSql;
export async function assertAssignableUsers(companyId: string, userIds: string[]): Promise<void>;
// GET /api/v1/tasks/assignable-users
interface AssignableUser { id: string; fullName: string; departmentName: string | null; jobTitle: string | null; avatarUrl: string | null }
```

### Call stacks

- **Sales assigns a warehouse colleague:**
  1. `TaskDialog` → `GET /tasks/assignable-users` → pick.
  2. `POST /tasks` → `boardAccessSql` (sales board) → `assertAssignableUsers` → insert → `TASK_CREATED`.
- **The warehouse colleague moves it:**
  1. «Мои задачи» → `GET /tasks?assignee=me` (`taskAccessSql`).
  2. `PATCH /tasks/:id { stageId }` → `scopedTask` (`viaAssignment`) → same-board stage → update.

### Test plan

- **`routes/crossDepartmentTasks.integration.test.ts` (dbHarness):**
  - sales employee assigns a warehouse employee → 201, no board membership;
  - the warehouse employee: «Мои задачи» includes it, the sales board list doesn't show other tasks, another sales task → 404;
  - the warehouse employee: stage move and comment succeed; `boardId` or assignee change → 403 `TASK_OUTSIDER_FORBIDDEN`, audited; delete → 403;
  - removed from assignees → 404;
  - disabled or other-company assignee → 400 `INVALID_ASSIGNEE`.
- **`scope.test.ts`:** `taskAccessSql` combines board access and assignment.
- **`TaskBoards.test.tsx`:**
  - the picker lists other departments and assigns a colleague from another department;
  - an outsider's dialog shows stages but no board select.
- Existing task tests stay green, with the old `ASSIGNEE_BOARD_ACCESS_REQUIRED` expectation updated to the new behaviour.

## Risks / Trade-offs

- [Employees now see every colleague's name, department and title in the picker] → that's what the user chose; it's names, not personal details.
- [A missed read path keeps hiding the task from its outsider] → one shared helper, and the integration test covers list, single task, comments and stage move.

## Least confident decisions

1. Outsiders can't change assignees, not even to remove themselves.
2. Outsiders can't move the task to another board even if they can open that board.
