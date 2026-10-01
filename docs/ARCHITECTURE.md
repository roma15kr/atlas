# Atlas architecture

Atlas is a Docker-first modular monolith sized for a 20-person company and a
straightforward path to 100+ users. The browser talks to one origin. Nginx serves
the React application, proxies REST traffic to the API, and upgrades Socket.IO
connections for presence and live chat.

## Runtime

- `web`: React + TypeScript workspace UI, compiled to static assets and served by Nginx.
- `api`: TypeScript HTTP API, background policy checks, and the Socket.IO gateway for presence and chat.
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

Team chat is company-wide communication and deliberately does not follow the
record scope. A conversation is a direct message (exactly one per pair of users),
a group (3-20 participants, no admins), or a channel. Membership decides who reads
a conversation; public channels are also readable by everyone in the company, who
must join before posting (`chatAccessSql` in `scope.ts`, `chatPermissions` in
`access.ts`). Directors and managers create channels; a channel's admins, and
directors, manage its settings, members, admins and archive state. **Directors
can manage a private channel but cannot read it, and cannot read DMs or groups
they are not in**: private conversations stay private, and any future compliance
access should be an explicit, audited export. Unknown and unreadable
conversations both return 404. Every company has a public "Общий" channel;
database triggers add every new or reactivated user to it (directors as admins)
and remove a deactivated user from groups and channels, while their DMs stay
readable but closed to new messages. Channel configuration, membership and
moderator deletions are audited (`CHAT_*`), never message text; ordinary messages
are not audited.

Chat endpoints (`/api/v1/chat`): `GET /people`, `GET /conversations` (mine, with
unread, mention and last-message data), `GET /unread`, `GET /conversations/:id`,
`POST /direct`, `POST /groups`, `PATCH /groups/:id`, `GET|POST /channels`, `PATCH
/channels/:id`, `POST /channels/:id/archive|unarchive`, `POST
/conversations/:id/join`, `GET|POST /conversations/:id/members`, `PATCH|DELETE
/conversations/:id/members/:userId`, `PATCH /conversations/:id/mute`, `POST
/conversations/:id/read`, `GET|POST /conversations/:id/messages` (cursor
`before=<messageId>`, 60 posts per minute), `GET /messages/:id/replies`, `PATCH|DELETE
/messages/:id`, and `GET /mentions`. Unread counts are computed from each member's
`last_read_at`; mentions have their own read flag so a public-channel non-member
can be notified too. Realtime events go to per-user Socket.IO rooms (`user:<id>`)
resolved from membership at send time, so a removed member stops receiving events
immediately: `chat:message`, `chat:message-updated`, `chat:mention`,
`chat:membership`, `chat:conversation-updated` and `chat:read`. Clients re-fetch
after reconnecting.

Email is private to its owner, whatever their role: every `/api/v1/mail` route
filters by `mail_accounts.user_id` / `mail_threads.user_id` and returns 404 for
anyone else, directors included. A thread linked to a client or deal becomes
readable, never actionable, to whoever can see that record, through `GET
/clients/:id/communications`, `GET /deals/:id/communications` and `GET
/communications/mail/:threadId` (Bcc only for the owner). Threads link
automatically when a correspondent's address matches exactly one client the owner
can see; several matches become suggestions, and a thread the owner unlinks is
never relinked. Client and deal creation from mail reuse the `createClient` and
`createDeal` functions behind `POST /clients` and `POST /deals`. Other channels
(Telegram) add themselves to the same history through
`registerCommunicationSource`.

Every provider goes through IMAP and SMTP (`imapflow`, `nodemailer`); Google and
Microsoft only supply XOAUTH2 access tokens from a stored refresh token. The OAuth
redirect lands on the web route `/mail/oauth/:provider`, which posts the code and
a signed, single-use state bound to the user back to the API with the user's own
access token. Secrets are sealed with AES-256-GCM (`mail/crypto.ts`). User-entered
hosts are resolved and refused when private, and connections go to the resolved
address with SNI (`mail/hosts.ts`). HTML is sanitized once on ingest
(`mail/sanitize.ts`); remote images are deferred to `data-remote-src` and the web
app renders mail in a sandboxed frame without scripts, with a CSP that blocks
remote images until the owner allows them. Sync (`mail/sync.ts`) is windowed
(`MAIL_SYNC_DAYS`), incremental by UID, resets a folder on UIDVALIDITY change,
mirrors flag changes and server deletions, and threads by provider thread id,
references, then subject plus a shared correspondent within 30 days. A scheduler
in the API process (`mail/scheduler.ts`) runs due syncs under per-mailbox advisory
locks. Sending stores a SENDING copy first, submits over SMTP, appends to Sent for
plain IMAP servers, and keeps the draft when the send fails; sync later completes
the local copy instead of duplicating it. Mail audit events (`MAIL_*`) carry ids
and counts, never subjects, addresses or bodies. Live updates are `mail:changed`
and `mail:account` on the owner's `user:<id>` socket room.

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

chat_conversations (DM / GROUP / CHANNEL; one public default channel per company)
  -> chat_members (role ADMIN / MEMBER, last_read_at, muted)
  -> chat_messages (thread replies via parent_id) -> chat_mentions (per user, read flag)

users -> mail_accounts (sealed credentials) -> mail_folders
                        -> mail_threads (owner kept after disconnect; optional client / deal link)
                           -> mail_messages -> mail_attachments (cached on the document volume)
                        -> mail_drafts

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
