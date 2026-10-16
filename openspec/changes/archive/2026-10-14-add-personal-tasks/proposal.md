# Proposal

## Why

**Problem.** Every task sits on a department board, and everyone in the department sees all of it. A head's own to-dos are visible to her managers, and managers' private to-dos clutter the shared board, so the board stops being the place for work the team does together.

**Evidence.** Наталія Денисюк (head of «Департамент продаж»), 2026-10-14:
- «Должно быть разграничение мои личные задачи и задачи других. Мои личные задачи, менеджеров в "Мои задачи" видит каждый свое, а я должна видеть задачи менеджеров, они мои нет.»
- «"Доска": если в задаче принимает участие еще кто-то (кроме меня и директора), то задача должна быть на "Доске"… или может поставить доп. функцию – разместить на "Доске".»

**Success metric.** No task of a head appears to her managers unless it involves them. Checked live: Денисюк creates a task for herself, and a manager of «Отдел продаж» doesn't see it, while she sees a manager's personal task.

## What Changes

- **A task is either on the board (shared) or personal.** A switch «Показать на доске» on every task.
- **Automatic default:**
  - on when someone other than the author and directors is assigned;
  - off for a task that only the author (or a director) works on.
  - Adding such an assignee later turns it on; it never turns off by itself, and anyone who can edit the task can flip it.
- **A personal task is seen by:** its author, its assignees, the heads who cover the author's or an assignee's department (including parent departments: Денисюк sees her managers' personal tasks), and directors. Other people on the board don't see it, not even its count on the dashboard.
- **On screens:**
  - personal tasks appear in «Мои задачи» and, for those who may see them, on the board, with a «Личная» mark;
  - a head can filter the board to «Личные задачи команды».
- **Existing tasks stay on their boards,** so nothing disappears on release; a head can mark her own as personal.

## Announcement

Tasks can now be personal. A task only you (or a director) work on is hidden from your colleagues: you see it in «Мои задачи», and your head and the director see it too. As soon as you assign a colleague, the task goes on the board for the team. The «Показать на доске» switch lets you decide yourself.

## Non-goals

- Personal tasks of a head hidden from her own head or the director.
- Private comments inside a shared task.
- Moving existing tasks to personal automatically.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tasks`: on-board versus personal tasks, who sees personal tasks, the switch and its default, the board filter.

## Impact

- **Data:** migration `019`, `tasks.on_board boolean NOT NULL DEFAULT true`. Existing rows stay `true`.
- **API:** `taskAccessSql` (list, read, update, comments) and the dashboard task counts. Create and update accept `onBoard`.
- **Web:** the switch in `TaskDialog`, the «Личная» mark on cards, and the board filter for heads and directors. Demo mode mirrors it.
