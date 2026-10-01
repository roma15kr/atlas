# Tasks

## 1. Database

- [x] 1.1 Add `database/011_alert_rules_reports.sql`. Verify on PGlite with and without demo data, including the next-run backfill.

## 2. API

- [x] 2.1 Add `automation/alerts.ts` with the 5 rules, deduplication and resolution. Verify with PGlite integration tests per rule:
  - created once;
  - severity updated;
  - resolved when cleared;
  - `INACTIVITY` ignores users without consent;
  - a disabled user's alerts are resolved.
- [x] 2.2 Alert feed and dashboard: `state`, deal visibility and the new fields. Verify with tests: a manager without access to a restricted funnel doesn't see its deal alerts, and an employee sees only alerts about themselves.
- [x] 2.3 Add `automation/reports.ts` and register it in the scheduler. Verify with tests:
  - daily, weekly and monthly periods and next runs;
  - a missed run executes once;
  - a disabled creator pauses the report and it is audited.
- [x] 2.4 Report runs, pause, resume and delete endpoints with the access table and audit. Verify with supertest.
- [x] 2.5 Update `docs/ARCHITECTURE.md` (rules, schedule) and `docs/OPERATIONS.md`.

## 3. Web

- [x] 3.1 Add types, `AppContext` actions (`pauseReport`, `deleteReport`, `loadReportRuns`, `analyze`) and demo data.
- [x] 3.2 ReportsPage: filter, results dialog with history, pause, resume and delete. Verify with Testing Library.
- [x] 3.3 Add `AiAnalysisDialog` on TeamPage and ProfilePage. Verify with tests: the mode switch and the result rendering with source badge in demo mode, and an employee sees the action only for themselves.
- [x] 3.4 Dashboard alerts panel: rule labels and deal links.
- [x] 3.5 Take screenshots at desktop and 400px widths, checked against `ui-design-system`.

## 4. Verification

- [x] 4.1 Run `npm run typecheck && npm test && npm run build` and `openspec validate add-alert-rules-and-scheduled-reports --strict`.
- [ ] 4.2 On the test app:
  - an overdue-task alert appears for a test employee after a tick and resolves after the tasks are done;
  - a daily report gets its first run;
  - AI analysis renders with `source: RULES`.
