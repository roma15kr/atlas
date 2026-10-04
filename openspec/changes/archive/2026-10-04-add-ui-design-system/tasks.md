# Tasks

## 1. Design reference

- [x] 1.1 Cross-check every value in `specs/ui-design-system/spec.md` against `apps/web/src/styles.css` and `components/ui.tsx`. Verify that each quoted token, size and radius exists in the stylesheet (grep each value).
- [x] 1.2 Add a rule to `openspec/config.yaml` under `rules.design`: web UI changes follow the `ui-design-system` spec. Verify with `openspec instructions design --change add-ui-design-system --json`, which shows the rule.

## 2. Funnel settings screen

- [x] 2.1 Rewrite `FunnelSettingsPage.tsx` presentation on the Team layout:
  - funnel master list with active row
  - summary card with rename/delete
  - stages card with read-only rows (marker, name, outcome badge, deal count, up/down/edit/delete icons, drag reorder)
  - access summary card

  Verify with `npm run typecheck --workspace @atlas/web`.
- [x] 2.2 Implement the dialogs from design.md: new funnel, rename, delete funnel, add/edit stage with color presets, delete stage, access. Each keeps API errors in the dialog. Verify with component tests: the stage dialog adds a stage, the delete-stage dialog requires a target when it has deals, and the access dialog saves the chosen department.
- [x] 2.3 Replace the old funnel settings CSS with the minimal new classes from design.md. Verify that `grep -n "funnel-settings\|stage-row\|access-grid" apps/web/src` finds no leftovers and that `npm test --workspace @atlas/web` passes.
- [x] 2.4 Visually compare with the Team screen: render `/sales/settings` and `/team` in demo mode (done with headless Chromium in the scratchpad, at 1440px and 760px, including the stage and access dialogs) and verify:
  - card padding
  - list row metrics
  - no inline inputs
  - one primary button per view

## 3. Integration check

- [x] 3.1 Run `npm run typecheck && npm test && npm run build` and verify all pass.
- [x] 3.2 Run `openspec validate add-ui-design-system --strict` and verify it passes.
