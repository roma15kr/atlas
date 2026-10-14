# Tasks

## 1. Tracer bullet: a head's task for herself is hidden from her managers

- [x] 1.1 Add `database/019_personal_tasks.sql` (`on_board`, default true), the visibility predicate in `taskAccessSql`, and `onBoard` with its default on create. Verify a new `personalTasks.integration.test.ts`: a head's task assigned only to herself is personal and answers 404 to a manager of her department; a task she assigns to a manager is on the board and the other manager sees it; existing tasks stay visible. Commit.
- [x] 1.2 `onBoard` on update (explicit wins, adding a colleague turns it on, never off implicitly; outsiders 403), the head and director see managers' personal tasks (including through a parent department), `visibility=` filter, and dashboard counts. Verify the cases: the parent head sees a sub-department manager's personal task; another manager doesn't, nor in dashboard counts; an outsider can't flip it. Commit.

## 2. Screens

- [x] 2.1 Add the «Показать на доске» switch with the automatic default in `TaskDialog`, the «Личная» mark on cards, the board filter for heads and directors, and the demo branch. Verify the `TaskBoards.test.tsx` cases (a task for yourself is created personal and marked; assigning a colleague turns the switch on; a head filters «Личные задачи команды»; an employee doesn't see a colleague's personal task on the board). Commit.

## 3. Integration checks

- [ ] 3.1 Run `make check` and `npm run build`; verify both pass.
- [ ] 3.2 Run `npx openspec validate add-personal-tasks --strict`; verify it passes.

## Workflow follow-up

- PR into `dev`, check on atlas-dev; `dev` → `main`; live check with Денисюк's account structure; archive.
