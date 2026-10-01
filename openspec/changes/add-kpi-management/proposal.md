# Proposal

## Why

Ratings and achievements are the brief's main motivation tools, but the baseline audit found both empty in production:
- **KPIs:** there is no API or screen to create or change a KPI, so every rating is 0.
- **Achievements:** nothing awards them. The three badges seeded at startup ("On-time streak", "Clear runway", "Top result") can never be earned.
- **Deal close date:** a deal's `closed_at` is set only if a client sends it explicitly, so "deals won this month" can't be measured.

## What Changes

- **KPI management.** `GET/POST/PATCH/DELETE /api/v1/kpis`.
  - A director manages the KPIs of any active user.
  - A department head manages the KPIs of employees in their department.
  - Employees see only their own KPIs and can't change them.
- **Automatic KPIs.** A KPI has a **source**:
  - `MANUAL`: the manager enters the actual value;
  - `DEALS_WON_VALUE`: UAH won;
  - `DEALS_WON_COUNT`: deals won;
  - `TASKS_DONE`: tasks completed;
  - `TASKS_ON_TIME_RATE`: % of tasks completed by their due date.

  Automatic KPIs have a period (default: the current month), and Atlas recomputes their actual value from deals and tasks.
- **Deal close date follows the stage.** Moving a deal into a WON or LOST stage stamps `closed_at`, and moving it back to an OPEN stage clears it. Existing closed deals get their last update time as the close date.
- **Achievements are awarded** by a background job:
  - "On-time streak": the user's last 10 completed tasks with a due date were all on time.
  - "Clear runway": in the previous calendar month, at least 5 assigned tasks were due and none was finished late or left open.
  - "Top result": on the first day of a month, the highest rating among active non-director users. Ties all win, and the rating must be above 0.

  Each badge is awarded once per person and audited.
- **Automation scheduler.** One background job, run every 10 minutes under a database advisory lock, recomputes automatic KPIs and awards achievements. Later changes add alerts and scheduled reports to it.
- **Team screen.** The KPI card on a member's panel gets "Добавить KPI" plus edit and delete per row, in dialogs, for those who may manage them. Automatic KPIs show a source badge and no "actual" field.

## Capabilities

### Modified Capabilities
- `performance-rating`: KPI management, automatic sources, achievement awarding.
- `sales-pipeline`: `closed_at` follows the stage outcome.
- `audit-log`: KPI and achievement events.
- `web-workspace`: KPI editing on the team screen.

## Impact

- **Database:** migration `010_kpi_management.sql`.
- **API:**
  - new `routes/kpis.ts` and `automation/` (`scheduler.ts`, `kpis.ts`, `achievements.ts`);
  - changes to `routes/deals.ts`, `routes/team.ts` (KPI JSON gains `source`, `periodStart` and `periodEnd`), `server.ts` and `config.ts` (`AUTOMATION_INTERVAL_MS`).
- **Web:** `TeamPage` KPI card and dialogs, `types`, `AppContext` and demo data.
