# Proposal

## Why

**Problem.** "Sales needs the warehouse to prepare an order, and marketing needs accounting to check an invoice. In Atlas I can only assign a task to people of the board's department, so I either add a warehouse person to our whole board or keep asking in chat."

**Evidence.** The director asked for it on 2026-10-14: «user need to create and assign users from other departments». Today the API refuses such assignees with `ASSIGNEE_BOARD_ACCESS_REQUIRED`.

**Success metric.** In the first month at least 20 tasks are assigned across departments without adding anyone to a board as a member. Measured by counting tasks whose assignees include someone who can't open the board.

## What Changes

- Anyone working on a board can assign a task to **any active colleague of the company**, in any department.
- A colleague assigned from outside the board **sees only the tasks assigned to them**: in «Мои задачи» and by link. They can edit those tasks, comment, and move them between the board's stages. The rest of the board stays private.
- When someone is removed from a task's assignees, an outsider loses access to it.
- The assignee picker in the task dialog lists the whole company, grouped by department, with search.

## Announcement

You can now hand a task to anyone in the company: pick a warehouse colleague or the accountant right in the task dialog, even if they don't work on your board. They'll find it in «Мои задачи» and can update it, comment and move it along. Your other tasks stay private to your department.

## Non-goals

- Outsiders creating new tasks on the board, deleting tasks or moving them to other boards.
- Notifications beyond what Atlas already shows in «Мои задачи».
- Changing board membership: adding someone as a board member still gives them the whole board.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tasks`: assignees may be any active company user; an assignee who can't open the board gets access to their own tasks only; «Мои задачи» includes them.

## Impact

- Employees see colleagues' names, departments and job titles in the assignee picker.
- No data migration: assignees are already stored per task.
