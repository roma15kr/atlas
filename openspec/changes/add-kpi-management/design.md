# Design

## Context

- `kpis` holds `name`, `target`, `actual`, `unit`, `weight` and `due_at` per user.
- The rating SQL is duplicated in `team.ts`, `achievements.ts`, `reports.ts` and `ai.ts`.
- `achievement_definitions` exist for each company; `user_achievements` has `UNIQUE (user_id, achievement_id)`.
- Tasks have `completed_at` driven by stage category, `due_at`, and assignees in `task_assignees`.
- Deals have `closed_at`, but nothing sets it.

## Decisions

### 1. Migration `010_kpi_management.sql`
New `kpis` columns:
- `source text NOT NULL DEFAULT 'MANUAL'`, with a CHECK for the 5 sources.
- `period_start date` and `period_end date`, with `CHECK (period_end >= period_start)`.
- `created_by uuid REFERENCES users ON DELETE SET NULL`.
- `computed_at timestamptz`.

Constraints:
- `CHECK (source = 'MANUAL' OR period_start IS NOT NULL AND period_end IS NOT NULL)`.
- `CHECK (target > 0) NOT VALID`, so legacy rows are left alone.
- Index on `kpis (company_id, user_id)`.

Deal backfill:
- `UPDATE deals d SET closed_at = d.updated_at FROM deal_stages s WHERE s.id = d.stage_id AND s.outcome <> 'OPEN' AND d.closed_at IS NULL`.
- `UPDATE deals ... SET closed_at = NULL` where the stage is OPEN.

### 2. Access

| Endpoint | DIRECTOR | MANAGER | EMPLOYEE |
| --- | --- | --- | --- |
| `GET /kpis?userId=` | any company user | users of own department | self only (other `userId` → own) |
| `POST /kpis`, `PATCH /kpis/:id`, `DELETE /kpis/:id` | any ACTIVE company user | EMPLOYEEs of own department, not self | 403 `KPI_MANAGER_ONLY` + `KPI_CHANGE_DENIED` |

- A KPI outside the caller's scope gives 404 `KPI_NOT_FOUND`.
- A manager targeting another manager or a director gives 403 `KPI_MANAGER_ONLY`, audited.

### 3. Validation
- `name`: 1-120 characters.
- `unit`: 1-20 characters. Automatic sources force it: `UAH`, `сделок`, `задач` or `%`.
- `target`: greater than 0, at most 1e12.
- `weight`: 0-100, stored as a fraction (the UI shows %).
- `dueAt`: optional.
- `source` and period:
  - an automatic source requires `periodStart` and `periodEnd`, defaulting to the current month in Europe/Kyiv;
  - `actual` is accepted only for `MANUAL` (400 `KPI_ACTUAL_COMPUTED` otherwise).
- A KPI's source can't change after creation (400 `KPI_SOURCE_LOCKED`). Users delete and recreate instead.

### 4. Computation (`automation/kpis.ts`)
`recomputeKpis(companyId?, kpiIds?)` runs one `UPDATE kpis k SET actual = sub.value, computed_at = now() FROM (...) sub` per source:
- **`DEALS_WON_VALUE` / `_COUNT`:** deals with `owner_id = k.user_id`, a stage with `outcome = 'WON'`, and `closed_at::date` within the period.
- **`TASKS_DONE`:** tasks with an assignee row for the user and `completed_at::date` within the period.
- **`TASKS_ON_TIME_RATE`:** tasks for the user with `due_at::date` within the period and either completed or past due. The value is `100 * on_time / NULLIF(count, 0)`, or 0 when there are none.

Only KPIs whose period includes today, or ended within the last 2 days, are recomputed, so closed periods freeze.

It runs:
- after a KPI's create or update (that KPI only);
- in every scheduler tick (all companies).

### 5. Achievements (`automation/achievements.ts`)
`awardAchievements(now)` inserts with `ON CONFLICT DO NOTHING RETURNING`, then audits each new row with `writeSystemAudit('ACHIEVEMENT_AWARDED')` and emits `achievement:awarded` to the user.
- **ON_TIME_10:** among the user's 10 most recent completed tasks that had a due date, all 10 have `completed_at <= due_at`, and there are exactly 10 such tasks.
- **ZERO_OVERDUE:** evaluated for the previous calendar month (Europe/Kyiv). It needs at least 5 assigned tasks with `due_at` in that month, and every one completed on or before `due_at`.
- **TOP_MONTH:** evaluated only when the local date is the 1st of the month. Winners are the ACTIVE non-DIRECTOR users with the maximum rating, provided it is above 0.
- Only ACTIVE users are awarded.

### 6. Scheduler (`automation/scheduler.ts`)
- `setInterval(AUTOMATION_INTERVAL_MS default 600000)`, wrapped in `pg_try_advisory_lock(hashtext('atlas:automation'))` on a dedicated client and released afterwards.
- It is disabled when `AUTOMATION_INTERVAL_MS=0`; tests call `runAutomation()` directly.
- Each step is isolated with try/catch and logged with pino, so one failing step doesn't stop the others.

### 7. Deal close date (`routes/deals.ts`)
- On create and update, when the resulting stage's outcome is `WON` or `LOST` and `closedAt` isn't given, `closed_at = COALESCE(existing closed_at when the outcome is unchanged, now())`.
- When the outcome becomes `OPEN`, `closed_at = NULL`.
- An explicit `closedAt` on a WON or LOST deal is kept.

### 8. Web
- **TeamPage KPI card:**
  - a header action "Добавить KPI", shown only for manageable members;
  - each row gets edit and delete icon buttons;
  - "Новый KPI" and "Изменить KPI" dialogs with source (segmented or select), name, target, unit (locked for automatic), weight %, period, deadline, and actual for MANUAL only.
- Automatic rows show a neutral badge "Авто" and "обновлено <time>".
- Deleting asks for confirmation.
- After a change, `/team` is re-fetched so the rating updates.

### Access rules
In the table above.

### Migrations and audit
- **Migration:** `010_kpi_management.sql`.
- **Audit:** `KPI_CREATED`, `KPI_UPDATED`, `KPI_DELETED`, `KPI_CHANGE_DENIED`, and `ACHIEVEMENT_AWARDED` (system).
