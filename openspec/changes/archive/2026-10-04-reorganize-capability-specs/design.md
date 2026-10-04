# Design

## Rule for where a requirement lives

- A requirement belongs to the capability whose behaviour it describes, whether that behaviour shows up in the API or on screen.
  - Example: "the profile screen lets the user upload a photo" belongs with "the API stores a profile photo", in `team-management`.
- `web-workspace` keeps only behaviour that is not specific to one feature: session, navigation, data loading and refresh, demo mode and dashboard totals.
- `ui-design-system` keeps the look-and-feel rules that apply to all screens.

## Mechanics

- The deltas were generated from the current main spec text. Each moved requirement is:
  - **ADDED** to the target capability verbatim, with all its scenarios;
  - **REMOVED** from the source capability, with the reason "Moved to <target>".
- Archiving leaves `task-boards` and `crm-funnels` with no requirements, so the change sets `retire_capabilities: true` and the archive deletes both specs.
- Requirements referenced by the still-open changes are not moved:
  - `messaging-integrations` "Integration status", "Scoped inbox" and "Link message to client";
  - `audit-log` "Audited actions";
  - `alerts-ai` "Scoped alert feed".

## Resulting capabilities (16)

| Capability | Covers |
| --- | --- |
| alerts-ai | Alert rules and feed, AI analysis |
| audit-log | Audit events and viewer |
| crm-clients | Clients, comments, export |
| documents | Document storage and access |
| identity-access | Login, tokens, sessions, passwords, scope |
| messaging-integrations | Shared integration status; to fold into the email and Telegram specs later |
| performance-rating | KPIs, rating, achievements, automation |
| platform-operations | Deployment, configuration, backups |
| presence | Online state, history, consent display |
| reports | Report building, schedules, results |
| sales-pipeline | Deals, funnels, stages, funnel access |
| tasks | Tasks, boards, stages, board access |
| team-chat | Internal chat |
| team-management | Members, administration, profile, job description |
| ui-design-system | Visual and interaction rules |
| web-workspace | Shared app shell behaviour |

`email-client` and `telegram-inbox` are added when their open changes are archived.
