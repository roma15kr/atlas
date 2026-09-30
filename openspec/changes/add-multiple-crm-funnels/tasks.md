# Tasks

## 1. Database migration

- [x] 1.1 Write `database/004_crm_funnels.sql`:
  - create `deal_funnels` and `deal_funnel_access` with checks, unique indexes, access indexes and `updated_at` trigger
  - add `funnel_id`, `outcome` and `UNIQUE (id, funnel_id)` to `deal_stages`
  - add `funnel_id`, `stage_id` and the composite `RESTRICT` foreign key to `deals`

  Verify: the file applies cleanly on a fresh local database (`npm run dev`, then `docker compose ... logs api` shows no migration error).
- [x] 1.2 Add the backfill to the same migration:
  - one "Основная воронка" `COMPANY` funnel per company
  - stage outcome mapping (`is_closed=false` → OPEN, key `LOST` → LOST, other closed → WON)
  - orphan deal keys become OPEN stages
  - duplicate stage names get a ` (KEY)` suffix
  - empty funnels get default stages
  - `deals.funnel_id`/`stage_id` backfilled and set `NOT NULL`
  - `deals.stage`, `deal_stages.key`, `deal_stages.is_closed` and the old unique constraint dropped

  Verify: on the demo-seeded local database, a before/after query of deal count per stage name shows identical numbers.
- [x] 1.3 Verify the database enforces the invariants with manual SQL on the local database:
  - updating a deal to a stage of another funnel fails
  - deleting a stage or funnel that has deals fails
  - a grant row with both or neither of `department_id`/`user_id` fails

  Also confirm migrations 001-003 are byte-identical (`git diff --stat database/` shows only 004).

## 2. Funnel access predicate

- [x] 2.1 Add `funnelAccessSql(auth, funnelColumn, startIndex)` to `apps/api/src/scope.ts` (company-only for DIRECTOR; `COMPANY` mode or user/department grant otherwise). Verify with new cases in `scope.test.ts` for each role, parameter numbering, and combination with `recordScope()`.
- [x] 2.2 Add a helper that checks whether a given user id (not only the actor) can access a funnel, for the owner check. Verify with a unit test using a mocked query for company-wide, user-grant, department-grant and denied cases.

## 3. Funnel and stage API

- [x] 3.1 Create `apps/api/src/routes/funnels.ts` with `GET /api/v1/funnels`:
  - accessible funnels ordered, with stages ordered
  - for DIRECTOR only: `accessMode`, `departmentIds`, `userIds`, and per-stage `dealCount`

  Mount it in `app.ts`. Verify with a route test that EMPLOYEE output has no grant fields.
- [x] 3.2 Add `directorOnlyConfig(operation)` middleware that writes `FUNNEL_CONFIG_DENIED` and returns 403 `DIRECTOR_ONLY`. Verify with a test that a MANAGER request is rejected and the audit write is called with the operation.
- [x] 3.3 Implement funnel create (with initial stages, ≥1 OPEN), rename/sort (`PATCH`), and delete (409 `FUNNEL_NOT_EMPTY` / `LAST_FUNNEL`), including a 409 `FUNNEL_NAME_TAKEN` mapping from the unique violation. Audit `FUNNEL_CREATED`/`FUNNEL_UPDATED`/`FUNNEL_DELETED`. Verify with zod schema tests and route tests for each error code.
- [x] 3.4 Implement `PUT /funnels/:id/access`, which validates that all departments and users belong to the company (400 `INVALID_ACCESS_GRANT`) and replaces grants in one transaction. Audit `FUNNEL_ACCESS_UPDATED` with previous and new grants. Verify with tests for a cross-company id and for audit metadata.
- [x] 3.5 Implement stage add, patch (name/color/outcome, `OPEN_STAGE_REQUIRED` guard) and `PUT /stages/order`, which requires an exact permutation (400 `INVALID_STAGE_ORDER`) and rewrites `sort_order` in steps of 10. Each runs under a `FOR UPDATE` funnel lock. Verify with unit tests for the permutation validator and the OPEN-stage guard.
- [x] 3.6 Implement stage delete with `moveToStageId`:
  - errors: `TARGET_STAGE_REQUIRED`, `INVALID_TARGET_STAGE`, 409 `LAST_STAGE`, `OPEN_STAGE_REQUIRED`
  - move the deals, then delete, in one transaction
  - map a foreign key violation to 409 `CONFLICT_RETRY`
  - audit `DEAL_STAGE_DELETED` with `movedDeals`

  Verify by deleting a stage with deals on the local stack: the deals appear in the target stage, and the audit screen shows the count.
- [x] 3.7 Remove `GET/POST /deals/stages` from `routes/deals.ts`. Verify both are gone. (Done: they now fall through to `/deals/:id` and return 400 `VALIDATION_ERROR`, like any non-UUID deal id.)

## 4. Deals, tasks and aggregates

- [x] 4.1 Update `routes/deals.ts` to use `funnelId`/`stageId`:
  - schema: `stage` becomes `funnelId` + optional `stageId`, defaulting to the first OPEN stage
  - list filter by `funnelId`
  - `dealColumns()` returns `funnelId` and `stage {id,name,color,outcome}`
  - every read and write combines `recordScope` with `funnelAccessSql`
  - actor check `FUNNEL_NOT_FOUND`, stage check `INVALID_DEAL_STAGE`, owner check `OWNER_FUNNEL_ACCESS_REQUIRED`
  - `DEAL_UPDATED` metadata includes `funnelId` on a funnel move

  Verify by extending `deals.test.ts` (schema defaults, UAH still enforced) and with a local check that an employee gets 404 for their own deal in a restricted funnel.
- [x] 4.2 Update `routes/tasks.ts`: `assertDealVisible` adds funnel access, and the `taskColumns()` deal summary is null without funnel access. Verify with a local check that an employee assigned a task linked to a restricted-funnel deal sees `deal: null`.
- [x] 4.3 Update `routes/dashboard.ts`, `routes/reports.ts` (won/lost by `outcome`, creator's funnel access) and `ai.ts` (`systemMetrics(auth, …)` with funnel access, OPEN by outcome) to join on `stage_id`. Verify with a local check that a manager without access to a funnel sees its deals excluded from dashboard pipeline and a new report, while the director's totals are unchanged.
- [x] 4.4 Update `bootstrap.ts#ensureDefaultCatalogs` to seed the Russian default funnel only for companies without funnels, under an advisory lock. Keep the achievement seeding. Verify by updating `bootstrap.test.ts` (asserts the no-funnel guard and lock). On the local stack, delete a stage, restart the API, and confirm the stage stays deleted.
- [x] 4.5 Run `npm run typecheck && npm test --workspace @atlas/api` and verify the API workspace is green.

> Verification note for groups 1-4: there is no Docker daemon in the dev container, so the migration and the
> route scenarios were run against the real API and migrations on PGlite (Postgres compiled to WASM) through
> its Postgres wire-protocol server, with the demo seed. 68 scenario checks passed. Route-level behaviour
> (3.1, 3.3, 3.4) is covered by that run; unit tests cover validators, middleware and SQL builders.

## 5. Web

- [x] 5.1 Update `types.ts` (`Funnel`, `DealStage` with `outcome`, `Deal` with `funnelId` and `stage` summary), `AppContext.tsx` (load `/funnels` instead of `/deals/stages`; `addDeal`/`moveDeal` send `funnelId`/`stageId`; config actions for Director) and `data/demo.ts` (two demo funnels, one restricted). Verify with `npm run typecheck --workspace @atlas/web` and the updated `AppContext.test.ts`.
- [x] 5.2 Update `SalesPage.tsx`:
  - funnel switcher showing only accessible funnels, with the remembered selection in try/catch-guarded `localStorage`
  - board is complete: the workspace loads every deal page (limit 100, follow `meta.total`) via a shared `listAll` helper, and the board filters by funnel
  - stage columns come from the selected funnel
  - the new-deal dialog has funnel and stage selects
  - "add stage" is removed for managers

  Verify with a component test that a manager sees no configure/add-stage control and that switching funnels changes the columns.
- [x] 5.3 Add the Director-only `/sales/settings` screen (`RoleGate(['DIRECTOR'])`):
  - funnel create/rename/delete
  - stage add/rename/color/outcome, and drag reorder that sends the full id list
  - delete-stage dialog that shows the deal count and requires a target stage when non-empty
  - access editor (company-wide/restricted, department and user multi-selects)
  - server error codes shown as Russian messages

  Verify with component tests for the delete dialog requiring a target and for the route redirecting a MANAGER.
- [x] 5.4 Update `DashboardPage.tsx` and `ClientPage.tsx` to use `deal.stage.outcome`/`deal.stage.name` instead of the flat stage list. Verify that `npm test --workspace @atlas/web` passes and that the dashboard pipeline equals the API `/dashboard` value on the local stack. (The API previously summed won and lost deals into `pipelineValue`; it now counts OPEN stages only, per the funnel-aware aggregates requirement.)

## 6. Documentation

- [x] 6.1 Update `docs/ARCHITECTURE.md` (data ownership tree with funnels/stages/access; access model paragraph on the funnel gate plus role scope) and `README.md` (feature list). Verify the text matches the implemented endpoints.
- [x] 6.2 Add a pre-deploy step to `docs/OPERATIONS.md`: take a manual `pg_dump` before deploying migration 004, and roll back by restoring it plus the previous image. Verify the documented command runs against the local stack. (No Docker here: the shell logic was dry-run with stub `pg_dump`/`pg_restore`; the real dump is taken on the test server before deploy.)
- [x] 6.3 Note in `docs/onboarding` that the Sales board now has a funnel switcher. The slides and screenshots are refreshed in a separate docs change. Verify the note exists.

## 7. Integration check

- [x] 7.1 Run `npm run typecheck && npm test && npm run build` and verify all pass.
- [x] 7.2 On the local compose stack with demo data, walk through the spec scenarios end to end:
  - director creates "Опт" restricted to "Продажи"
  - employee in another department cannot see it
  - manager of "Продажи" sees only their department's deals
  - delete a stage with deals and pick a target
  - restart the API
  - check audit events

  Verify that each step matches `specs/crm-funnels/spec.md`. (Done on the Coolify test app at commit f11b2a5: 69/69 scenario checks passed, with a test cast created through the API.)
- [x] 7.3 Run `openspec validate add-multiple-crm-funnels --strict` and verify it passes.
