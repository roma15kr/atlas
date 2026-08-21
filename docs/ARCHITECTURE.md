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
- `minio`: private S3-compatible object storage for document bodies.
- `backup`: verified daily PostgreSQL dumps with 14-day retention.
- `object-backup`: daily private document-bucket mirrors for restore operations.

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
                  |-> tasks -> optional deal

client -> contacts
       -> comments
       -> deals -> stage
       -> documents -> document_versions -> object storage

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
