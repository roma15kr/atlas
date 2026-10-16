# Proposal

## Why

**Problem.** The AI signal «Просроченные задачи» says only «Харруд Хишам: просрочено задач — 5». To act on it, the director has to search for those tasks by hand, although the alert already knows which tasks they are.

**Evidence.** The director, 2026-10-17, via a screenshot of the dashboard: he needs the details, with links to the overdue tasks.

**Success metric.** From an overdue-tasks signal, the director opens any of the overdue tasks in one click. Checked live on the current «Просроченные задачи» signals.

## What Changes

- **Each «Просроченные задачи» signal lists its overdue tasks:** title, board and due date, oldest first, up to 10. When there are more, it adds «и ещё N».
- **A click on a task opens it.**
- **The list respects visibility.** It shows only tasks the viewer may open (a manager's personal tasks stay hidden from heads who don't oversee them), and only tasks still not done.
- **On the dashboard** the list is folded under «Показать задачи (5)», so the feed stays compact.

## Announcement

AI signals about overdue tasks now list the tasks themselves. Click «Показать задачи» on the signal and open any of them directly.

## Non-goals

- Links for other signal types (deals already link to the client; KPI and inactivity signals have no tasks).
- Bulk actions on overdue tasks (reassign, move the deadline).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `alerts-ai`: an overdue-tasks alert carries and shows its tasks.

## Impact

- **API:** `GET /alerts` and the dashboard's alerts include `tasks` for `TASKS_OVERDUE`, resolved from the alert's evidence ids for the caller.
- **Web:** the dashboard alert row.
- **No data changes.**
