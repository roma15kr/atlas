# Tasks

## 1. Overdue tasks in alerts

- [ ] 1.1 Resolve `tasks` (visible to the caller, not done, by due date) and `more` for `TASKS_OVERDUE` alerts in `GET /alerts` and the dashboard. Verify integration cases: the director gets titles and boards of all five; a head sees only tasks they may open; a task moved to done disappears; another rule's alert has no `tasks`. Commit.
- [ ] 1.2 Show «Показать задачи (N)» with task links on the dashboard alert row, with the demo shape. Verify a `Dashboard` web test: expand, click a task, its dialog opens. Commit.

## 2. Integration checks

- [ ] 2.1 Run `make check` and `npm run build`; verify both pass.
- [ ] 2.2 Run `npx openspec validate link-overdue-tasks-in-alerts --strict`; verify it passes.

## Workflow follow-up

- PR into `dev`, `dev` → `main`; live check on the current «Просроченные задачи» signals; archive.
