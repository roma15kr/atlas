# Proposal

## Why

Atlas has one company-wide sales pipeline, but the business runs several sales processes (for example, wholesale, retail, and partner deals) with different stages and different teams. Stages can only be appended: nobody can rename, reorder, recolor, or remove them, and any MANAGER can add a stage that changes every department's board. Some pipelines also need to be visible only to specific departments or people.

## What Changes

- Add **CRM funnels**: a company can have several named funnels, each with its own ordered stages. Every deal belongs to exactly one funnel and one of its stages.
- Only a **DIRECTOR** can create, rename, and delete funnels, and add, edit (name, color, outcome), reorder, and delete stages.
- **BREAKING**: MANAGERs can no longer create deal stages. Today `POST /api/v1/deals/stages` allows DIRECTOR and MANAGER.
- Deleting a stage that still has deals requires choosing a target stage in the same funnel. The deals are moved and the stage is deleted in one audited step. A funnel's last stage and a company's last funnel cannot be deleted, and a funnel can be deleted only when it has no deals.
- **Funnel access**: a funnel is either open to the whole company or restricted to specific departments and/or users. DIRECTORs always have access. Access works as a gate: inside an accessible funnel, the existing role scope still applies (employees see their own deals, managers see their department's deals).
- Deals, stage lists, deal-linked task summaries, the dashboard, reports, and AI analysis include only deals in funnels the viewer can access. A deal's owner must have access to its funnel.
- Stages get an explicit **outcome** (`OPEN`, `WON`, `LOST`). It replaces the `is_closed` flag and the hard-coded `LOST` stage key in reports.
- **BREAKING (API)**: deals reference stages by `stageId` (and expose `funnelId`) instead of the company-unique `stage` key. `GET /deals/stages` and `POST /deals/stages` are replaced by funnel-scoped endpoints. The web app is the only client and ships in the same release.
- A migration moves every company's existing stages and deals into one default company-wide funnel, so no user loses access and no deal changes stage.
- Production startup stops re-creating default stages. It seeds a default funnel only for a company that has no funnels, so stages the Director deletes stay deleted.
- Web: the Sales board gets a funnel switcher, and Directors get a funnel settings screen for funnels, stages, and access.

## Capabilities

### New Capabilities
- `crm-funnels`: funnels, stage administration with outcomes and reordering, deletion with deal relocation, department/user access control, and funnel-aware deal visibility and aggregates.

### Modified Capabilities
- `sales-pipeline`: company-wide stages are replaced by funnel stages; deals carry a funnel and stage id; deal creation, moves, and listing enforce funnel access; stage creation is Director-only.
- `reports`: won/lost is defined by stage outcome instead of the `LOST` key; report metrics count only deals in funnels the report creator can access.
- `alerts-ai`: pipeline metrics in work analysis count only deals in funnels the requester can access.
- `tasks`: linking a task to a deal requires access to the deal's funnel, and deal summaries are hidden from viewers without access.
- `platform-operations`: the production bootstrap seeds a default funnel only for companies without funnels, instead of re-inserting default stages on every start.
- `audit-log`: funnel and stage configuration changes, access changes, and denied configuration attempts are audited.

## Impact

- **Database**: new migration `004_crm_funnels.sql` adds `deal_funnels` and `deal_funnel_access`, adds `funnel_id` and `outcome` to `deal_stages`, adds `funnel_id` and `stage_id` foreign keys to `deals`, backfills them, then drops `deals.stage`, `deal_stages.key`, and `deal_stages.is_closed`. Migrations 001-003 are unchanged. The demo seed (002) runs before 004 and is backfilled like production data.
- **API**: new `apps/api/src/routes/funnels.ts` and a shared funnel-access helper. Changes to `routes/deals.ts`, `routes/tasks.ts`, `routes/dashboard.ts`, `routes/reports.ts`, `ai.ts`, and `bootstrap.ts`, plus their tests.
- **Web**: `SalesPage.tsx`, a new funnel settings screen, `AppContext.tsx`, `types.ts`, `ClientPage.tsx`, `DashboardPage.tsx`, and `data/demo.ts`.
- **Docs**: `docs/ARCHITECTURE.md` (data ownership and access model) and the employee onboarding material that shows the Sales board.
- **Behavior for existing users**: none until a Director restricts a funnel. Managers lose the "add stage" button.
