# Atlas architecture

Atlas is a Docker-first modular monolith sized for a 20-person company and a
straightforward path to 100+ users. The browser talks to one origin. Nginx serves
the React application, proxies REST traffic to the API, and upgrades Socket.IO
connections for presence.

## Runtime

- `web`: React + TypeScript workspace UI, compiled to static assets and served by Nginx.
- `api`: TypeScript HTTP API, background policy checks, and Socket.IO presence gateway.
- `postgres`: source of truth for identity, CRM, work, files, reports, and audit history.
- `redis`: ephemeral presence, session coordination, and rate-limit counters.
- `documents_data` volume: document file bodies, mounted only into `api`.
- `backup`: verified daily PostgreSQL dumps with 14-day retention.
- `document-backup`: daily copy of new document files into a separate backup volume.

Document files are immutable: every upload and every new version gets its own
random storage key, so backups only copy files they have not seen. The volume
ties the API to one instance; running several API replicas would need shared
storage, which the API supports through optional `S3_*` settings.

External integrations are adapter boundaries. An adapter reports `disabled`
until its server-side credentials are configured; secrets never enter the web
bundle. The AI boundary combines deterministic risk rules with optional Claude
summarization and never reads private message content.

## Access model

Every authenticated request carries a user and department scope. Directors can
read company-wide records. Managers can read and mutate records owned by their
department. Employees can access their own records. SQL predicates enforce the
scope in addition to route-level role checks. Bulk CRM export is a director-only
route, and both successful and rejected sensitive actions enter the audit log.

Deals live in sales funnels. A funnel is open to the whole company or restricted
to chosen departments and users; directors always see every funnel. Funnel access
is a gate on top of the record scope, not a replacement: inside a funnel an
employee still sees only their own deals and a manager only their department's.
A deal's owner must be able to open its funnel. Deal lists, deal-linked task
summaries, dashboard pipeline, reports, and AI pipeline metrics all apply the
same funnel predicate. Only directors configure funnels, stages, and access;
attempts by other roles are rejected and audited as `FUNNEL_CONFIG_DENIED`.

Tasks live on task boards, and boards are shared rather than owner-scoped. A user
opens a board when they are a director of the company, the board belongs to their
department, or they were added as an extra member; a board without a department
is a director board that only directors and its members open. Everyone who opens a
board sees and moves all of its tasks, and every assignee must be able to open it
(`boardAccessSql` and `boardUserAccessSql` in `scope.ts`). A task can be deleted by
its creator or a board manager. Board configuration (boards, stages, members) is
limited to directors and to managers for their own department's boards; other
attempts return 403 `BOARD_MANAGER_ONLY` and are audited as
`TASK_BOARD_CONFIG_DENIED` with the board's department. Each stage has a category
(`TODO`, `ACTIVE`, `DONE`); done-task metrics, `completed_at` and the "Мои задачи"
columns all follow the category, so custom stage names keep reports correct.
Reports and AI metrics count a shared task once per assignee.

Task board endpoints (`/api/v1/task-boards`): `GET /` (boards with ordered stages,
task counts, `canManage`, and `memberIds` for managers), `POST /`, `PATCH` and
`DELETE /:id` (only when empty), `PUT /:id/members`, `GET /:id/users` (people who
can open the board), `GET /:id/candidates` (managers only), and stage `POST
/:id/stages`, `PATCH /:id/stages/:stageId`, `PUT /:id/stages/order`, `DELETE
/:id/stages/:stageId?moveToStageId=`. `/api/v1/tasks` takes `boardId`, `stageId`
and `assigneeIds`, and filters by `boardId`, `stageId`, `category`, `priority`,
`dealId` and `assignee=me|<id>`.

Refresh tokens are rotated and stored as hashes. Access tokens are short-lived.
Login attempts are rate-limited and repeated failures temporarily lock the
account. Document objects stay private and are streamed only after an access
check. Presence expires when heartbeats stop rather than trusting a stale socket.

## Data ownership

```text
department -> users -> kpis
                  |-> refresh_tokens
                  |-> presence_events
                  |-> achievements

department -> task_boards (NULL department = director board)
               -> task_board_stages (ordered, category TODO / ACTIVE / DONE)
               -> task_board_members (extra members from any department)
               -> tasks -> board + stage (database-enforced: the stage belongs to the board)
                        -> task_assignees (one or more users)
                        -> optional deal

deal_funnels -> deal_stages (ordered, outcome OPEN / WON / LOST)
             -> deal_funnel_access (department or user grants)

client -> contacts
       -> comments
       -> deals -> funnel + stage (database-enforced: the stage belongs to the funnel)
       -> documents -> document_versions -> files on the document volume

report_definitions -> report_runs
audit_events
alerts
integration_connections
```

The API records each SQL migration before continuing. Migration checksums protect
against silently changing applied files. The demo seed is enabled only by the
local override; production skips it and bootstraps one director from a random
runtime secret when the user table is empty.

Atlas uses Ukrainian hryvnia (`UAH`) as its single operating currency. The API
and database reject other deal currencies so dashboard, pipeline, report, and AI
aggregates cannot mix incompatible monetary values.
