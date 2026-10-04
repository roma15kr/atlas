# Design

## Context

Stages live in `deal_stages`, which is unique on `(company_id, key)`. Deals point at a stage through the free-text `deals.stage` key, with no foreign key. Closed-ness is the boolean `is_closed`, and reports treat "won" as `is_closed AND key <> 'LOST'`. The stage key is joined by text in `routes/deals.ts`, `routes/dashboard.ts`, `routes/reports.ts` and `ai.ts`. `bootstrap.ts#ensureDefaultCatalogs` re-inserts the six default stages with `ON CONFLICT DO NOTHING` on every production start, so a deleted default stage comes back. Record scope is built by `recordScope()` in `scope.ts` and is the pattern to extend. The web Sales page reads one flat stage list from `GET /deals/stages` and builds stage keys from the name, stripping Cyrillic.

## Goals / Non-Goals

**Goals:**
- Deal-to-stage-to-funnel consistency enforced by the database, not only by route code.
- One reusable SQL predicate for funnel access, used everywhere deals are read or aggregated.
- A zero-downtime-for-users upgrade: existing data behaves the same until a Director changes access.

**Non-Goals:**
- Per-funnel custom fields, default probabilities, or stage automation.
- Read-only or "view but not edit" funnel grants. Access is all-or-nothing on top of role scope.
- Letting managers configure funnels. That was decided: Director only.
- Scoping clients by funnel. Clients stay owner/department scoped. A client can have deals in several funnels.
- Fixing the web app's 25-row list limit in general. Only the Sales board pages through its funnel's deals (see Decision 8).
- Archiving stages or funnels.

## Decisions

### 1. Data model with a composite foreign key
New migration `database/004_crm_funnels.sql`:

- `deal_funnels (id, company_id, name, sort_order, access_mode CHECK IN ('COMPANY','RESTRICTED'), created_at, updated_at)`, with a unique index on `(company_id, lower(name))`.
- `deal_funnel_access (id, funnel_id → deal_funnels ON DELETE CASCADE, department_id → departments ON DELETE CASCADE NULL, user_id → users ON DELETE CASCADE NULL)`:
  - `CHECK (num_nonnulls(department_id, user_id) = 1)`
  - unique on `(funnel_id, department_id)` and on `(funnel_id, user_id)`
- `deal_stages` gains:
  - `funnel_id → deal_funnels ON DELETE CASCADE`
  - `outcome CHECK IN ('OPEN','WON','LOST')`
  - `UNIQUE (id, funnel_id)`
  - a unique index on `(funnel_id, lower(name))`
- `deals` gains:
  - `funnel_id → deal_funnels ON DELETE RESTRICT`
  - `stage_id`
  - `FOREIGN KEY (stage_id, funnel_id) REFERENCES deal_stages (id, funnel_id) ON DELETE RESTRICT`
- The migration drops `deals.stage`, `deal_stages.key`, `deal_stages.is_closed`, and the `(company_id, key)` unique constraint.

*Why:* the composite foreign key makes "stage belongs to the deal's funnel" impossible to violate. `RESTRICT` makes deleting a stage or funnel that still has deals fail at the database even if route code is wrong.
*Alternatives:*
- Keep text keys, unique per funnel. Rejected: it keeps the unvalidated text join and the Cyrillic key problem.
- Keep `is_closed` next to `outcome`. Rejected: two sources of truth.

### 2. Access predicate next to `recordScope`
Add `funnelAccessSql(auth, funnelColumn, startIndex)` to `scope.ts`:
- For a DIRECTOR it returns only the company predicate.
- For everyone else it returns `EXISTS (SELECT 1 FROM deal_funnels f WHERE f.id = <col> AND f.company_id = $n AND (f.access_mode = 'COMPANY' OR EXISTS (grant for user $m) OR EXISTS (grant for department $k)))`.

Deal queries combine it with `recordScope()` using `AND`. It is a pure function with unit tests, like `scope.test.ts`.
*Alternative:* resolve the accessible funnel ids first and pass an `= ANY($1)` array. Rejected: it is an extra round trip on every query, and there is a risk of forgetting it in aggregates. A single predicate is easier to audit.

### 3. Access rules per endpoint

| Endpoint | DIRECTOR | MANAGER | EMPLOYEE |
| --- | --- | --- | --- |
| `GET /api/v1/funnels` | all company funnels, with grants and per-stage deal counts | accessible funnels, stages only | accessible funnels, stages only |
| `POST /funnels`, `PATCH /funnels/:id`, `DELETE /funnels/:id` | yes | 403 `DIRECTOR_ONLY` + audit | 403 + audit |
| `PUT /funnels/:id/access` | yes | 403 + audit | 403 + audit |
| `POST /funnels/:id/stages`, `PATCH /funnels/:id/stages/:stageId`, `PUT /funnels/:id/stages/order`, `DELETE /funnels/:id/stages/:stageId?moveToStageId=` | yes | 403 + audit | 403 + audit |
| `GET/POST/PATCH/DELETE /deals` | funnel access plus company scope | funnel access plus department scope | funnel access plus own deals |

`GET /deals/stages` and `POST /deals/stages` are removed. The web app is their only caller. A shared `directorOnlyConfig(operation)` middleware writes `FUNNEL_CONFIG_DENIED` (with operation and funnel id) before returning 403.

Deal create, update and move check three things:
1. The actor can access the target funnel. Otherwise `FUNNEL_NOT_FOUND` (404), consistent with the other hidden records.
2. The stage belongs to that funnel. Otherwise `INVALID_DEAL_STAGE`.
3. The resulting owner can access the funnel. Otherwise `OWNER_FUNNEL_ACCESS_REQUIRED` (403).

### 4. Stage deletion and ordering run in one transaction under a funnel lock
Every configuration write runs in `transaction()` and starts with `SELECT … FROM deal_funnels WHERE id=$1 AND company_id=$2 FOR UPDATE`. Concurrent edits to one funnel are therefore serialized.

Deleting a stage takes these steps:
1. Validate the target: same funnel, not the stage being deleted.
2. `UPDATE deals SET stage_id = target WHERE stage_id = deleted`.
3. `DELETE` the stage.
4. Check that the funnel still has at least one `OPEN` stage and at least one stage.
5. Write the audit event with `movedDeals` and `targetStageId`.

A deal inserted into the stage between steps 2 and 3 makes the `RESTRICT` foreign key fail. That surfaces as 409 `CONFLICT_RETRY`. Per-deal `DEAL_UPDATED` events are not written; the single stage-deletion event carries the count.

Reorder takes the complete id list, validates it as an exact permutation of the funnel's stages, and rewrites `sort_order` as 10, 20, 30, and so on.

### 5. Outcome replaces `is_closed` and the `LOST` key
- Open pipeline means `outcome = 'OPEN'`.
- Won means `WON`.
- Lost means `LOST`.

Dashboard, reports and `ai.ts` switch their joins to `ds.id = d.stage_id`. Reports and AI get the viewer's `auth` so they can add `funnelAccessSql`. `systemMetrics` now takes `auth` instead of only `companyId`.

### 6. Task deal summary hides restricted funnels
The deal summary in `taskColumns()` becomes `CASE WHEN d.id IS NOT NULL AND <funnelAccessSql(viewer, 'd.funnel_id')> THEN json_build_object(…) END`. Task visibility itself is unchanged: tasks are still scoped by assignee.

### 7. Bootstrap seeds a funnel only when a company has none
`ensureDefaultCatalogs()` inserts a default `COMPANY` funnel named "Основная воронка" with default stages, only for companies with no row in `deal_funnels`. It runs under `pg_advisory_xact_lock('atlas-default-funnels')` so two starting instances cannot create duplicates. The default stages are:
- Заявка (OPEN)
- Переговоры (OPEN)
- Счёт выставлен (OPEN)
- Оплата (WON)
- Отгрузка (WON)
- Проиграна (LOST)

These are Russian names, where the old seed used English ones. Existing companies keep their migrated names. Achievement definitions keep their current idempotent insert.

### 8. Web
- **Sales page:**
  - A funnel switcher lists the funnels from `GET /funnels`. The last selected funnel is remembered in `localStorage`, guarded by try/catch.
  - The workspace loads deals with a shared `listAll` helper that follows `offset` until `meta.total` is reached (limit 100 per page), and the board filters by the selected funnel, so a funnel's board is complete. (Implemented this way instead of a per-funnel fetch so that dashboard and client pages see the same complete, funnel-filtered deal set.)
  - Cards use `deal.stage` (id, name, color, outcome) from the response. The "add stage" button is removed.
- **Director-only settings screen:**
  - Route `/sales/settings`, behind `RoleGate(['DIRECTOR'])`. It contains:
    - funnel list: create, rename, delete
    - stage editor: add, rename, color, outcome, and drag-to-reorder that sends the full order
    - delete-stage dialog: shows the stage's deal count and requires a target stage when the count is above 0
    - access editor: company-wide/restricted toggle, and multi-selects for departments and users
- **New-deal dialog:** gets funnel and stage selects.
- **Dashboard and client pages:** use `deal.stage.outcome` instead of looking up `stages[].isClosed`.
- **`types.ts`, `AppContext.tsx` and `data/demo.ts`:** move to the funnel shape.

### 9. Implementation notes
- Stage names that collide within a funnel return 409 `STAGE_NAME_TAKEN` (mirrors `FUNNEL_NAME_TAKEN`).
- The dashboard API's `pipelineValue` and `weightedPipeline` now count `OPEN` stages only. Before, they summed won and lost deals too, which disagreed with the web dashboard and with "open pipeline" in the spec.
- Tasks hide both `deal` and `dealId` when the viewer cannot open the deal's funnel.
- The removed `GET /deals/stages` now resolves to `GET /deals/:id` and returns 400 `VALIDATION_ERROR`, like any non-UUID deal id.

### 10. Audit events
New events:
- `FUNNEL_CREATED`
- `FUNNEL_UPDATED` (name/sort)
- `FUNNEL_DELETED`
- `FUNNEL_ACCESS_UPDATED` (previous and new mode, department ids, user ids)
- `DEAL_STAGE_CREATED`
- `DEAL_STAGE_UPDATED` (changed fields)
- `DEAL_STAGES_REORDERED`
- `DEAL_STAGE_DELETED` (`targetStageId`, `movedDeals`)
- `FUNNEL_CONFIG_DENIED` (operation)

These are company-level events with `departmentId` null, visible to the Director in the audit screen. `DEAL_UPDATED` metadata includes `funnelId` when a deal changes funnel.

## Risks / Trade-offs

- **Restricting a funnel hides deals from their own owners.** A Director restricts a funnel, and employees who own deals in it lose sight of them. → The Director still sees everything and can reassign. The access change is audited with previous grants for easy reversal. The settings screen shows the per-stage deal counts so the impact is visible.
- **The migration is not reversible.** It drops `deals.stage`, `deal_stages.key` and `is_closed`. → Take a manual `pg_dump` immediately before deploy, in addition to the daily backup. Rollback means restoring that dump and redeploying the previous image. All derived data (key, outcome) is kept in the new columns during migration, and the dropped columns are only derived values.
- **Migrated stage names can collide.** Two existing stages in one company may share a name, since names were not unique, which would break the new `(funnel_id, lower(name))` unique index. → Before creating the index, the migration appends ` (KEY)` to duplicates.
- **Deals can point at a missing stage.** A deal's `stage` key may have no matching stage, because there was no foreign key. → The migration creates an `OPEN` stage named after that key at the end of the default funnel, so no deal is lost or silently moved.
- **An API breaking change.** Any external script that uses `stage` keys or `/deals/stages` breaks. → The web app is the only known client, and `scripts/smoke.sh` does not touch deals. The change is noted in the proposal as BREAKING.
- **Aggregate queries cost more.** The `EXISTS` subquery is added to aggregates. → Index `deal_funnel_access (funnel_id)`, `(user_id)` and `(department_id)`. Data volume is small (about 20 users). The predicate is skipped entirely for DIRECTORs.

## Migration Plan

1. Take a pre-deploy `pg_dump` (see `docs/OPERATIONS.md`).
2. Deploy. On startup the API applies `004_crm_funnels.sql` in one transaction via the checksummed runner. The steps in order:
   1. Create one "Основная воронка" `COMPANY` funnel per company.
   2. Attach its stages and map `is_closed`/`key` to `outcome`.
   3. Create stages for orphan keys and fix duplicate names.
   4. Add default stages to any funnel still empty.
   5. Backfill `deals.funnel_id` and `stage_id`, then set them `NOT NULL`.
   6. Add the constraints.
   7. Drop the old columns.
3. The new bootstrap sees each company already has a funnel and does nothing.
4. Verify:
   - The Sales board shows the same deals per stage as before.
   - The dashboard pipeline value is unchanged.
   - Managers no longer see the "add stage" button.
5. Rollback: restore the pre-deploy dump and redeploy the previous image.
