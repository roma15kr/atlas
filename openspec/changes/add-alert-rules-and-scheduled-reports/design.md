# Design

## Context

- `alerts` has severity, category, title, summary, evidence, user and department, and acknowledgement fields.
- `reports` stores one computed `result` and a `schedule` label.
- `reportMetrics(auth, ...)` in `routes/reports.ts` computes KPI, deal, task and attendance figures, with deal access limited to the creator's funnels.
- `add-kpi-management` provides `automation/scheduler.ts` with steps that run under an advisory lock.

## Decisions

### 1. Migration `011_alert_rules_reports.sql`
- **`alerts`** gains:
  - `rule text`, `dedupe_key text` and `resolved_at timestamptz`;
  - `deal_id uuid REFERENCES deals(id) ON DELETE CASCADE`;
  - the index `CREATE UNIQUE INDEX alerts_open_dedupe ON alerts (company_id, dedupe_key) WHERE dedupe_key IS NOT NULL AND resolved_at IS NULL`.
- **`reports`** gains `active boolean NOT NULL DEFAULT true`, `next_run_at timestamptz` and `last_run_at timestamptz`. Recurring reports are backfilled with the next 06:00 Kyiv boundary.
- **`report_runs`** is a new table:
  - columns `id`, `report_id` (cascade), `company_id`, `period_start`, `period_end`, `result jsonb` and `created_at`;
  - an index on `(report_id, created_at DESC)`.

### 2. Rules (`automation/alerts.ts`)
`evaluateAlerts(companyId)` builds the current set of `{rule, key, severity, userId, departmentId, dealId?, title, summary, evidence}` with one SQL query per rule. For each rule:
- it inserts the missing keys with `INSERT ... ON CONFLICT (company_id, dedupe_key) WHERE dedupe_key IS NOT NULL AND resolved_at IS NULL DO UPDATE SET severity = EXCLUDED.severity, evidence = EXCLUDED.evidence, summary = EXCLUDED.summary`, so a count that grows refreshes the open alert;
- it resolves the open alerts of that rule whose key is no longer present: `resolved_at = now()`.

Only ACTIVE users are considered, and alerts about users who are now disabled are resolved. Titles and summaries are Russian.

| Rule | Condition | Key | Subject | Department |
| --- | --- | --- | --- | --- |
| `TASKS_OVERDUE` | at least 3 open assigned tasks with `due_at < now()` | `tasks_overdue:<user>` | user | user's |
| `DEAL_CLOSE_OVERDUE` | OPEN stage and `expected_close_at < current_date` | `deal_close:<deal>` | owner | deal's |
| `DEAL_STALLED` | OPEN stage and `updated_at < now() - 14 days` | `deal_stalled:<deal>` | owner | deal's |
| `KPI_BEHIND` | period set; elapsed share e in [0.5, 1); progress p = actual/target; p < e − 0.3 | `kpi_behind:<kpi>` | user | user's |
| `INACTIVITY` | `monitoring_consent_at` set; account older than 3 days; 3 or more weekdays (Mon–Fri, Kyiv) between the last `ONLINE` presence event and today with no event | `inactivity:<user>` | user | user's |

Evidence holds only counts, ids and dates, never client data. Deal titles appear in the title, which is why deal visibility applies.

### 3. Feed visibility (`routes/alerts.ts`, `routes/dashboard.ts`)
- The existing role scope stays: a director sees the company, a manager their department, an employee alerts about themselves.
- Additionally, `(a.deal_id IS NULL OR EXISTS (SELECT 1 FROM deals d WHERE d.id = a.deal_id AND <dealScope>))`.
- `state` is `open` (default: `resolved_at IS NULL`) or `all`. Responses add `rule`, `dealId` and `resolvedAt`.
- The dashboard shows the 5 newest open alerts.
- **Decision:** employees keep seeing alerts about themselves. The monitoring policy promises transparency about what is recorded, and the rules use only their own work data.

### 4. Scheduled runs (`automation/reports.ts`)
- **Boundaries** are computed in SQL in Europe/Kyiv. The next run is the next 06:00 local time:
  - daily: tomorrow;
  - weekly: next Monday;
  - monthly: the 1st of next month.
- **Periods per run:**
  - DAILY: the previous day.
  - WEEKLY: the previous Monday–Sunday.
  - MONTHLY: the previous calendar month.
- `runDueReports()`:
  - selects `active AND schedule <> 'ONCE' AND next_run_at <= now()` `FOR UPDATE SKIP LOCKED`;
  - loads the creator. If the creator isn't ACTIVE or is an EMPLOYEE, it sets `active=false` and audits `REPORT_SCHEDULE_PAUSED` with `reason: creator_unavailable`;
  - otherwise it builds an `AuthContext` for the creator and calls `reportMetrics` with the report's target and department;
  - it inserts a `report_runs` row and updates `result`, `period_start`, `period_end`, `last_run_at` and `next_run_at`.
- Missed runs (for example, the server was down) run once, for the latest period only. No backfill storm.
- On `POST /reports`, the immediate result also inserts the first `report_runs` row. Recurring reports get `next_run_at`.

### 5. Report endpoints

| Endpoint | DIRECTOR | MANAGER | EMPLOYEE |
| --- | --- | --- | --- |
| `GET /reports/:id/runs` | company | department reports | reports targeting themselves |
| `PATCH /reports/:id` `{ active }` | any | department reports | 403 |
| `DELETE /reports/:id` | any | department reports | 403 |

- An out-of-scope report gives 404 `REPORT_NOT_FOUND`.
- `PATCH` with `active: true` recomputes `next_run_at`.

### 6. Web
- **ReportsPage:**
  - the schedule filter works;
  - each row opens a "Результаты" dialog with the latest figures (KPI progress, deals, won value in UAH, conversion, tasks and attendance), the period, and the next run;
  - a "История" tab in the same dialog lists the runs with their periods and key numbers;
  - row actions: pause or resume (recurring only) and delete with confirmation.
- **`AiAnalysisDialog`** takes a `targetUserId`. A segmented control picks the mode. "Сформировать" calls `/ai/analyze`. The result shows the summary, a numbered list of recommendations, and a badge, "Claude" or "Правила", plus a muted note with `fallbackReason` when Claude failed.
  - It is opened from TeamPage (members the viewer manages, plus themselves) and from ProfilePage, as an "AI-рекомендации" card.
  - In demo mode, a local rule-based result is used.
- **DashboardPage and the alerts panel:** show the rule label, a "Решено" badge when viewing history, and link deal alerts to the deal's client page.

### Access rules
Covered in 3 and 5. AI analysis keeps `manageableUser`.

### Migrations and audit
- **Migration:** `011_alert_rules_reports.sql`.
- **Audit:** `REPORT_SCHEDULE_PAUSED`, `REPORT_SCHEDULE_RESUMED`, `REPORT_DELETED`, `REPORT_RUN_COMPLETED` (system, with the run id).
- Alert creation itself is not audited; the alert row is the record.
