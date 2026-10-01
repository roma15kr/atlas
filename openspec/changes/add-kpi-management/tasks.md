# Tasks

## 1. Database

- [x] 1.1 Add `database/010_kpi_management.sql`, with KPI columns and constraints plus the deal `closed_at` backfill. Verify on PGlite with and without demo data.

## 2. API

- [x] 2.1 Add `routes/kpis.ts` with the CRUD, access table, validation and audit. Verify with supertest: a manager adds a KPI for their employee, a manager can't target another manager, an employee gets 403 and it is audited, and `actual` on an automatic KPI gives 400.
- [x] 2.2 Add `automation/kpis.ts` recomputation for the 4 automatic sources. Verify with integration tests against PGlite: a won deal inside and outside the period, tasks done on time and late, and a frozen past period.
- [x] 2.3 Deal `closed_at` follows the stage outcome. Verify with tests: moving to WON stamps it, moving back to OPEN clears it, and an explicit value is kept.
- [x] 2.4 Add `automation/achievements.ts`. Verify with tests for each badge: positive, negative, idempotent, and a disabled user never awarded.
- [x] 2.5 Add `automation/scheduler.ts` with the advisory lock and `AUTOMATION_INTERVAL_MS`, wired in `server.ts`. Verify with a test that a failing step does not stop later steps (lock exclusion itself follows the mail scheduler pattern; PGlite cannot show it).
- [x] 2.6 The team and achievements responses include `source` and `period`. Update `docs/ARCHITECTURE.md` and `docs/OPERATIONS.md` (variable, scheduler).

## 3. Web

- [x] 3.1 Add types, `AppContext` KPI actions and demo implementations.
- [x] 3.2 Add the TeamPage KPI card actions and dialogs. Verify with Testing Library: a manager adds an automatic KPI without an actual field, and an employee sees no actions.
- [ ] 3.3 Take screenshots at desktop and 400px widths, checked against `ui-design-system`.

## 4. Verification

- [x] 4.1 Run `npm run typecheck && npm test && npm run build` and `openspec validate add-kpi-management --strict`.
- [ ] 4.2 On the test app:
  - add a `DEALS_WON_COUNT` KPI for a test employee;
  - move one of their deals to a won stage;
  - after the next tick, the rating is above 0.
