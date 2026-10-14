# Tasks

## 1. Tracer bullet: assign a colleague from another department

- [ ] 1.1 Add `assertAssignableUsers` and use it instead of `assertAssigneesBoardAccess` in `routes/tasks.ts`; add `taskAccessSql` and use it for the task list and `scopedTask`. Verify the new `crossDepartmentTasks.integration.test.ts` cases (assign across departments; the outsider sees it in «Мои задачи» but not the board's other tasks; invalid assignee → 400) pass, update the old `ASSIGNEE_BOARD_ACCESS_REQUIRED` test to the new rule, and keep other task tests green; commit.

## 2. What an outsider may do

- [ ] 2.1 Limit outsiders in `PATCH /tasks/:id` (no `boardId`, no assignees → 403 `TASK_OUTSIDER_FORBIDDEN`, audited `TASK_UPDATE_DENIED`), return `boardStages` for them, and keep delete with the existing rule. Verify the cases (stage move and comment allowed; board change, assignee change, delete refused; removed assignee → 404) pass; commit.

## 3. Picker and dialog

- [ ] 3.1 Add `GET /api/v1/tasks/assignable-users` and `assignableUsers()` in `AppContext` with a demo branch; change the `TaskDialog` picker to the whole company grouped by department with search, and the outsider mode (stages from `boardStages`, no board select, assignees read-only). Verify the `TaskBoards.test.tsx` cases pass; commit.

## 4. Integration checks

- [ ] 4.1 Run `make check` and `npm run build`; verify both pass.
- [ ] 4.2 Run `npx openspec validate assign-tasks-across-departments --strict`; verify it passes.

## Workflow follow-up

- Merge into `dev`, check on the test app, then `dev` → `main`; archive the change.
