# Proposal

## Why

After archiving the first 12 changes, the capability specs overlap and one of them has become a catch-all:
- `tasks` (4 requirements) and `task-boards` (8) describe the same feature: tasks organised on boards.
- `sales-pipeline` (4) and `crm-funnels` (11) describe the same feature: deals moving through funnels.
- `web-workspace` (15) holds screen-level requirements for profile, KPIs, presence, passwords and exports. So whoever changes a feature has to update two specs.

This change reorganises the specs. **Behaviour does not change.** Every requirement keeps its exact text and scenarios; only the spec it belongs to changes.

## What Changes

- **Tasks.** Every `task-boards` requirement moves into `tasks`, and the `task-boards` spec is deleted.
- **Sales.** Every `crm-funnels` requirement moves into `sales-pipeline`, and the `crm-funnels` spec is deleted.
- **Feature screens move out of `web-workspace`:**
  - "KPI editing on the team screen" → `performance-rating`;
  - "Honest profile screen", "Editable personal profile", "Photos and contacts across the workspace" and "Job description editor" → `team-management`;
  - "Password change screens" → `identity-access`;
  - "Live presence in the UI" and "Monitoring consent notice" → `presence`;
  - "Director-only export control" → `crm-clients`.
- **What stays in `web-workspace`:** behaviour shared by the whole app — session handling, role-gated navigation, workspace data loading, demo mode, automatic refresh and dashboard totals.
- **Purposes.** The Purpose sections of `tasks`, `sales-pipeline` and `web-workspace` are updated to describe their new scope.

## Not in this change

- `messaging-integrations` and `audit-log` stay as they are. The open `add-email-client` change still removes and modifies requirements there. Fold the rest of `messaging-integrations` into `email-client` and `telegram-inbox` after that change is archived.
- The open `add-alert-rules-and-scheduled-reports` change now adds its "Report results screen" requirement to `reports` instead of `web-workspace`, following the same rule.

## Impact

Only the specs change: 18 capability specs become 16. No code, API or database changes.
