# Atlas architecture

Atlas is a Docker-first modular monolith sized for a 20-person company and a
straightforward path to 100+ users. The browser talks to one origin. Nginx serves
the React application, proxies REST traffic to the API, and upgrades Socket.IO
connections for presence and live chat.

## Runtime

- `web`: React + TypeScript workspace UI, compiled to static assets and served by Nginx.
- `api`: TypeScript HTTP API, the automation scheduler (KPIs, achievements, alert rules, scheduled reports), and the Socket.IO gateway for presence and chat.
- `postgres`: source of truth for identity, CRM, work, files, reports, and audit history.
- `redis`: ephemeral presence, session coordination, and rate-limit counters.
- `documents_data` volume: document file bodies, mounted only into `api`.
- `backup`: verified daily PostgreSQL dumps with 14-day retention, encrypted to an age public key when `BACKUP_AGE_RECIPIENT` is set.
- `document-backup`: daily copy of new document files into a separate backup volume, encrypted the same way.

Document files are immutable: every upload and every new version gets its own
random storage key, so backups only copy files they have not seen. The volume
ties the API to one instance; running several API replicas would need shared
storage, which the API supports through optional `S3_*` settings.

External integrations are adapter boundaries. An adapter reports `disabled`
until its server-side credentials are configured; secrets never enter the web
bundle. The AI boundary (`/api/v1/ai/analyze`, shown on the team and profile
screens) combines deterministic rules with optional Claude summarization and
never reads private message content.

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

Telegram customer chats go through one company bot. The public webhook
`POST /api/telegram/webhook` (outside `/api/v1`, before the per-IP limiter) checks
the secret token in constant time, stores the update in `telegram_updates` (unique
`update_id`, so duplicates are ignored), answers 200 and processes it right after;
a sweeper retries failures. Polling mode feeds the same handler. Each private chat
is a `telegram_contacts` row with an optional client, a responsible user and a
department copied from that user by trigger. Access follows record scope through
the responsible user (`telegramAccessSql`): directors see the company, heads their
department plus unassigned contacts, employees their own. Binding happens through
CSV import (preview, then apply), single-use invite links (`/start <token>`; only a
SHA-256 hash is stored; the creator becomes responsible when they may handle the
client, otherwise the client's owner) or triage by heads and directors. Customer
messages, including those sent before the link, are read from the conversation by
its current client, so the client's "Переписка" always shows the full history and
relinking moves it; deal links are a separate table. Replies go out through the bot
with the sending user recorded; a 403 "blocked" marks the contact BLOCKED, and a
"chat not found" on an imported contact is reported as unreachable. Endpoints:
`/api/v1/telegram` (status, settings, webhook check, contacts, messages, read,
files, triage, client and deal creation, import) and `POST
/api/v1/clients/:id/telegram-invite`. Events: `telegram:message`,
`telegram:contact` and `telegram:read` to the contact's audience.

Refresh tokens are rotated and stored as hashes. Access tokens are short-lived
and kept only in the web app's memory: a reload restores the session through
the httpOnly refresh cookie, and refreshes are serialized across tabs with the
Web Locks API so rotation never looks like token reuse.
Login attempts are rate-limited and repeated failures temporarily lock the
account. Document objects stay private and are streamed only after an access
check.

Presence tracks connections per user (Redis sorted set `presence:sockets:<id>`,
or memory without Redis) and an "active" state with a 5-minute expiry. The
browser reports `presence:heartbeat { active }` every minute, where active means
keyboard, mouse, scroll or touch input in any Atlas tab (shared through
`localStorage`) within 5 minutes, and immediately when that flips. A person is
ONLINE while a connection is open and they are active; closing one of several
tabs changes nothing. Only real changes are broadcast as `presence:changed` and
written to `presence_events` (ONLINE, OFFLINE, or TIMEOUT at the last-seen time
when an expired state is noticed), and history is written only for people who
accepted the current monitoring policy (`MONITORING_POLICY_VERSION`). Live
status is shown regardless, since it is not stored. Report attendance and AI
activity metrics likewise use only consenting people; others are marked
`consent: false`, and the `INACTIVITY` alert rule skips them.

## Accounts and KPIs

Directors and department heads administer accounts: a director anyone in the
company, a head only the employees of their own department. Editing role or
department is director-only and never for oneself, and the last active director
can't be demoted or disabled. Disabling revokes refresh sessions and closes
sockets; existing triggers then remove chat memberships and unassign Telegram
customers. A password reset sets `must_change_password`; until the person
changes it, `authenticate` answers 403 `PASSWORD_CHANGE_REQUIRED` outside
`/auth/*` and the socket refuses the connection.

Everyone edits their own personal details through `PATCH /api/v1/team/me`:
name, specialty, date of birth, phone, contact email, city, "about" and
whether colleagues see their birthday. The full birth date is returned only to
the person; colleagues get `birthday` (`MM-DD`) while it is shown. Profile
photos (`POST`/`DELETE /team/me/avatar`) are JPEG, PNG or WebP up to 2 MB,
recognized by magic bytes and stored next to documents. The browser
re-encodes them to a 512×512 JPEG first, which drops camera metadata.
`GET /api/v1/avatars/:id` serves them without a token, because `<img>` can't
send one; it sits outside the per-IP API limit and is cached as immutable. The
id is random and changes with every upload, so a replaced photo stops
resolving. Directors, and heads for their own employees, can remove a member's
photo (`DELETE /team/:id/avatar`).

KPIs (`/api/v1/kpis`) follow the same who-manages-whom rule. A KPI is `MANUAL`
(the head enters the actual value) or automatic: `DEALS_WON_VALUE`,
`DEALS_WON_COUNT`, `TASKS_DONE`, `TASKS_ON_TIME_RATE`, measured over its period
from deals (`closed_at`, kept in step with the stage outcome by the
`deals_close_date` trigger) and tasks (`completed_at`, `due_at`, assignees).

`automation/scheduler.ts` runs every `AUTOMATION_INTERVAL_MS` (10 minutes) in
one API process at a time (advisory lock `atlas:automation`). Steps run in
order and are isolated from each other's failures: recompute automatic KPIs
(current periods and those that ended within 2 days; older ones freeze), then
award achievements (ON_TIME_10, ZERO_OVERDUE for the previous Kyiv month,
TOP_MONTH on the 1st), each once per person, audited as `ACHIEVEMENT_AWARDED`
without an actor and pushed as `achievement:awarded`; then evaluate alert rules;
then run due scheduled reports.

Alert rules (`automation/alerts.ts`): `TASKS_OVERDUE` (3+ overdue assigned
tasks, CRITICAL from 6), `DEAL_CLOSE_OVERDUE`, `DEAL_STALLED` (14 days without
change), `KPI_BEHIND` (more than 30 points behind the elapsed share of the
period, from half-way), and `INACTIVITY` (3 working days offline, only for
people with monitoring consent). Each condition keeps one open alert
(`dedupe_key`, unique while `resolved_at IS NULL`); the alert is updated while
the condition holds and resolved when it clears. Acknowledging records review
only. The feed shows open alerts by default (`state=all` for history), scoped by
role, and an alert about a deal only to people who can see that deal under deal
scope and funnel access. Evidence holds counts, ids and dates.

Recurring reports run at 06:00 Kyiv (`report_next_run`) for the previous day,
Monday–Sunday week or month, with the creator's scope; each run is kept in
`report_runs`. A creator who is disabled or no longer a director or head pauses
the schedule (`REPORT_SCHEDULE_PAUSED`, reason `creator_unavailable`).

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

telegram_settings (per company: bot, texts, default responsible)
telegram_contacts (client, responsible -> department) -> telegram_messages (files on the document volume)
                  -> telegram_reads, telegram_deal_links
telegram_invites (hashed single-use tokens), telegram_updates (dedupe and retry)

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

## Code map

Where to look when a task spans several files.

- **Request path:** `apps/api/src/app.ts` mounts the routers, and the order matters:
  1. the Telegram webhook comes before the rate limiters;
  2. `/api/v1/avatars` sits behind only `ipFloodLimiter`, because `<img>` sends no token;
  3. `ipFloodLimiter` and `apiLimiter` apply next (`middleware.ts`; `apiLimiter` is keyed per user when signed in, per IP otherwise);
  4. `/api/v1/auth` is public;
  5. `authenticate` (`auth.ts`) guards the rest. It answers 403 `PASSWORD_CHANGE_REQUIRED` outside `/auth/*` while a reset password must be changed.
- **Access:**
  - `scope.ts` `recordScope(auth, columns)` builds the SQL predicate for each role.
  - Team administration rules are in `routes/teamAdmin.ts` `adminDenial`.
  - Funnel access (`deal_funnel_access`) and board access are extra gates.
  - Audit: `audit.ts` `writeAudit` for requests, `writeAutomationAudit` for background jobs.
- **Database:**
  - `migrations.ts` applies `database/NNN_*.sql` in order and verifies checksums. `*_seed.sql` runs only with `SEED_DEMO_DATA`.
  - Some rules are triggers: a deal's close date follows its stage outcome; disabling a user removes chat memberships and unassigns Telegram contacts.
- **Background work:**
  - `automation/scheduler.ts` runs every `AUTOMATION_INTERVAL_MS` (`0` turns it off) under the advisory lock `atlas:automation`. Its steps are `kpis.ts` → `achievements.ts` → `alerts.ts` → `reports.ts`.
  - Mail sync is `mail/scheduler.ts` (`MAIL_SCHEDULER`).
  - Telegram is `telegram/runner.ts` or the webhook.
- **Realtime:**
  - `socket.ts`: one authenticated socket per tab. It refuses connections that still need a password change, and attaches its handlers before any await.
  - `presence.ts`: the presence store, Redis or in memory.
  - `realtime.ts`: `disconnectUser`.
- **Files:** `storage.ts` `objectStorage` stores files on the local volume, or on S3 when fully configured. `routes/avatars.ts` serves profile photos by a random id.
- **Web:**
  - `context/AppContext.tsx` has two providers:
    - `AuthProvider`: the session, profile and password;
    - `WorkspaceProvider`: all workspace data, loaded through `listAll`, with refresh and the actions.
  - Chat, mail and Telegram have their own contexts and share the one socket through `atlas:socket` window events.
  - `lib/api.ts` holds the session store in memory, the refresh serialised by the Web Lock `atlas-refresh`, and `apiRequest`, `api.*` and `api.download`.
  - Shared UI primitives are in `components/ui.tsx`, and styles are plain CSS in `styles.css` with tokens on `:root`.
  - Demo data is in `data/demo.ts`. Demo sessions have tokens starting with `demo-`.
- **Tests:**
  - API database tests use `src/test/dbHarness.ts` (PGlite with the real migrations). `harness.user(name, role, department)` returns a user with a signed token.
  - Web tests use Testing Library with jsdom (`src/test/setup.ts`).
  - `infra/test/backup-roundtrip.sh` checks encrypted backups and their restore.
