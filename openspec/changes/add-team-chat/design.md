# Design

## Context

- **The existing `messages` table** stores customer-channel messages keyed by an owning user. It has no notion of a recipient user, a conversation or membership, so it can't hold chat. It stays as it is for the customer inbox and is retired by `add-email-client`.
- **Socket.IO is already authenticated** in `socket.ts`. It joins per-user and per-role presence rooms, and it runs in the single API process. Redis, when configured, stores presence only; there is no Socket.IO Redis adapter.
- **Record scope doesn't fit chat.** Role scope (`recordScope`: director = company, manager = department, employee = own) governs every business record today. Chat is a deliberate exception: it is company-wide communication gated by conversation membership, not by record scope.
- **There is no deactivation endpoint.** A user is deactivated by setting `users.status` to `DISABLED`.
- **Company size:** about 20 users, heading to 100+. Message volume is modest, so Postgres alone is enough for storage, unread counts and search.

## Goals / Non-Goals

**Goals:**
- Direct messages, group conversations and channels in one model, with membership deciding visibility.
- Correct unread and mention counts at 100+ users without background jobs.
- Realtime delivery that never leaks a private conversation's events to a non-member.

**Non-Goals:**
- Attachments, reactions, message pinning, rich text or markdown formatting, link previews, message search across conversations, browser or push notifications, typing indicators, and guest users. Each can be added later without changing this model.
- Linking chat messages to clients, deals or tasks. Customer communication is covered by `add-email-client` and `add-telegram-customer-inbox`.
- Retention policies or export of chat history.

## Decisions

### One conversation table with a `kind`
`chat_conversations`:

| Column | Notes |
| --- | --- |
| `id` | |
| `company_id` | |
| `kind` | `DM`, `GROUP` or `CHANNEL` |
| `name` | |
| `description` | |
| `visibility` | `PUBLIC` or `PRIVATE`; channels only, enforced by a CHECK |
| `is_default` | the "Общий" channel |
| `dm_key` | for DMs: the two user ids sorted and joined; UNIQUE per company |
| `created_by` | |
| `archived_at` | |
| `last_message_at` | |
| `created_at` | |

A partial unique index on `(company_id, lower(name)) WHERE kind='CHANNEL' AND archived_at IS NULL` enforces channel-name uniqueness.

One table keeps listing, unread counting, messages and sockets identical for all three kinds. Separate tables per kind were rejected because every query would need a UNION.

### Membership and admin roles
`chat_members`:

| Column | Notes |
| --- | --- |
| `conversation_id`, `user_id` | primary key |
| `role` | `ADMIN` or `MEMBER` |
| `joined_at` | |
| `last_read_at` | |
| `muted` | |

- **Access to a DM or group:** the caller has a `chat_members` row.
- **Access to a channel:** the caller has a membership row, or the channel is PUBLIC in the caller's company. A non-member reads a public channel through the preview path and must join to post.
- **Managing a channel:** the caller is its ADMIN, or a DIRECTOR of the company. For the default channel, directors are its only admins, and its membership rules are fixed.

These rules live in one SQL predicate, `chatAccessSql`, in `scope.ts`, next to `boardAccessSql`. Every chat route and the socket fan-out use it. Unknown and forbidden conversations both return 404, as boards do.

**Directors don't read private channels or DMs.** Directors see every business record, but private communication is different. Letting the director read DMs would make the chat unusable for honest conversation and would be a privacy concern under employee-monitoring law. Directors keep control of access: they can manage any channel's members and settings and archive it, but reading private messages requires being a member. This is recorded as a product decision. If the company later wants compliance access, it should be an explicit, audited "export conversation" feature, not silent read access.

### Messages, threads and mentions
`chat_messages`:

| Column | Notes |
| --- | --- |
| `id` | |
| `conversation_id` | |
| `author_id` | |
| `parent_id` | nullable; must reference a top-level message in the same conversation |
| `body` | |
| `edited_at` | |
| `deleted_at` | |
| `created_at` | |
| `reply_count` | denormalized on the parent |
| `last_reply_at` | denormalized on the parent |

Indexes are `(conversation_id, created_at DESC) WHERE parent_id IS NULL` and `(parent_id, created_at)`. Deleting a message sets `deleted_at` and blanks `body` in the same statement, so the text isn't retained.

`chat_mentions (message_id, user_id)` is filled by the API when a message is stored or edited.
- The API parses `@username` tokens (usernames are already restricted to `[a-z0-9._-]`) and resolves them against users who can see the conversation.
- For `@channel`, it adds a row for every member, but only when the author may use it.
- Mentions of users who can't see the conversation are dropped, so nothing leaks.
- The composer inserts `@username` from the directory autocomplete and renders it as the person's name.

### Unread counts computed on read
`unread = count(messages where created_at > member.last_read_at and author_id <> me and deleted_at is null)` per conversation. It is computed in the conversation-list query, using the conversation index. At this scale, with a few dozen conversations per person, one grouped query is cheap and never drifts. Stored counters were rejected because they need fan-out writes on every message and repair logic.

Thread replies count toward the conversation's unread count, so a reply is never missed. Opening a thread doesn't mark the whole conversation read; opening the conversation does. The mention count is `chat_mentions` joined to messages newer than `last_read_at`.

### Realtime: rooms per user, fan-out by membership
Each socket joins `chat:user:<id>`. When a message is posted, the API resolves the audience with the access predicate and emits to each audience user's room. A public channel's audience is its members; non-members browsing it re-fetch. The emitted events are `chat:message`, `chat:message-updated`, `chat:conversation-updated`, `chat:membership` and `chat:read`.

Emitting per user room, rather than to a shared `chat:conversation:<id>` room, means removing someone takes effect at once: there is no socket room to forget to leave. The cost is one emit per recipient, which is trivial at 100 users.

The socket server is exposed to routes through a small `realtime.ts` module, set at startup and a no-op in tests. The web client re-fetches the open conversation and the conversation list after reconnecting.

### Company channel and deactivation handled in the database
Migration `006` creates "Общий" per company, with `is_default`, PUBLIC visibility, all ACTIVE users as members and directors as admins. Two triggers keep it that way:
- an `AFTER INSERT ON users` trigger adds new users (as admin when they are a DIRECTOR);
- an `AFTER UPDATE OF status, role ON users` trigger removes a user who becomes DISABLED from GROUP and CHANNEL memberships, and keeps default-channel adminship in sync with the DIRECTOR role.

Triggers were chosen, as for the default task board, because users can be created or deactivated outside the API (bootstrap, SQL).

DM rows are kept. A DM with a DISABLED participant is read-only, checked at post time.

### Channel creation rights
Only DIRECTORs and MANAGERs create channels. Anyone can start a DM or group, which covers ad-hoc conversations without cluttering the channel list. A MANAGER may create channels about anything, not only their department. Channels aren't owned by departments, because cross-department channels are a main use case.

### API surface (`/api/v1/chat`)
- `GET /people`: the directory.
- `GET /conversations`: my conversations with unread and mention counts, last message and last activity.
- `POST /direct`: `{ userId }`; open or get a DM.
- `POST /groups`: `{ userIds, name? }`.
- `PATCH /groups/:id`: rename.
- `GET /channels?archived=`: public channels plus my private ones, with the caller's membership flag.
- `POST /channels`.
- `PATCH /channels/:id`.
- `POST /channels/:id/archive` and `POST /channels/:id/unarchive`.
- `GET|POST /conversations/:id/members`, `PATCH|DELETE /conversations/:id/members/:userId`: members and roles. A user may remove themselves, which is leaving.
- `POST /conversations/:id/join`: public channels.
- `GET /conversations/:id/messages?before=&limit=`.
- `POST /conversations/:id/messages`: `{ body, parentId? }`.
- `GET /messages/:id/replies`.
- `PATCH /messages/:id` and `DELETE /messages/:id`.
- `POST /conversations/:id/read`.
- `PATCH /conversations/:id/mute`.
- `GET /mentions`.

Rate limit: 60 posts per minute per user, using the existing limiter pattern.

### Web
**`MessagesPage`, the chat,** follows `ui-design-system`:
- `PageHeader` "Сообщения" with the description "N непрочитанных · M упоминаний" and one primary "Новое сообщение".
- A left master-list `Surface` with sections "Упоминания", "Каналы" (a secondary "Все каналы" text button opens the browse dialog) and "Личные сообщения". Rows show a name, a last-message caption, and an unread `Badge`. The active row uses the Team-list selection style.
- The main `Surface` holds the conversation: a `SectionHeader` with the channel name, member count and an `IconButton` for settings; the message list; and a composer with mention autocomplete. Enter sends and Shift+Enter adds a new line.
- The thread opens as a right-side panel `Surface`. It is not nested in the conversation card.

**Dialogs:**
- "Новое сообщение" (`md`): a people picker. One person opens the DM; several start a group.
- "Новый канал" (`md`): name, description, visibility.
- "Настройки канала" (`lg`): details plus the member list, with add and remove actions and an admin toggle as row `IconButton`s.
- "Все каналы" (`md`): browse, join, and a "show archived" toggle.
- Confirmations for leaving, archiving and deleting a message (`sm`).

**Other web changes:**
- The navigation badge shows the real unread total, replacing the hard-coded `2`.
- The old customer inbox page moves to `InboxPage` at `/inbox` ("Входящие", in the same navigation group). The client card's "Написать" button points at `/inbox` until `add-email-client` repoints it to compose mail.
- Demo mode ships sample channels, a group and DMs so tests and the offline demo work without the API.

## Risks / Trade-offs

- **[Per-user emits at 100+ users for "Общий"]** → 100 emits per message is fine for a single process. If the API is ever scaled horizontally, add the Socket.IO Redis adapter, which user rooms support unchanged.
- **[Unread query cost as history grows]** → The count uses the indexed `created_at > last_read_at` range, and is capped by displaying "99+" (`LIMIT 100` per conversation in a lateral subquery).
- **[Directors can't read DMs]** → This is a deliberate product decision, stated in the proposal and specs so the owner can object before implementation.
- **[Mentions by username feel technical]** → The composer shows names and autocompletes. The stored text keeps `@username` so it is unambiguous and survives renames.
- **[Chat directory exposes all colleagues' names and departments to employees, where the Team page shows employees only themselves]** → Only name, department and job title are exposed, which is the minimum needed to message someone. This is recorded here as an intended widening.

## Migration Plan

1. Migration `006_team_chat.sql` creates the tables, indexes, triggers and "Общий" channels, and backfills members. It is additive and doesn't touch `messages`.
2. Deploy the API and web together. The old `POST /messages` INTERNAL path is removed in the same release, and the web app is its only client.
3. **Rollback:** redeploy the previous image. The new tables are unused by old code. Leave them, or drop them with a follow-up migration if the feature is abandoned; never edit `006`.

## Implementation notes

- **Socket rooms:** sockets join a generic `user:<id>` room (not `chat:user:<id>`) so mail and Telegram can reuse it. `realtime.ts` exposes `emitToUsers`.
- **One socket per tab:** the web app keeps a single authenticated socket in `AppContext`. Other providers receive its events through a window `atlas:socket` event, because a second socket would break presence (one disconnect marks the user offline).
- **Mention read state:** mentions carry their own `read_at` rather than relying on `last_read_at`. That lets a public-channel non-member be notified and clear the mention by opening the channel.
- **API additions:**
  - `GET /conversations/:id` returns a public channel preview for non-members.
  - Posting to a public channel without joining returns 409 `CHAT_JOIN_REQUIRED`; private channels stay 404.
  - Unarchive is `POST /channels/:id/unarchive`, audited as `CHAT_CHANNEL_UNARCHIVED`.
- **Default-channel trigger:** it also re-adds reactivated users and keeps directors as admins when roles change.
- **Verification:**
  - Local scenario suite (`e2e-chat.mjs`, 46 checks, real Postgres via PGlite, live Socket.IO client): one DM per pair; director 404 on DMs, groups and private channels; employee channel-create denial; duplicate names; public read and join; live delivery; mention counts including a public non-member; threads and invalid parents; edit and moderation (audited without text); public-to-private access loss; director manage-without-read; last-admin guard; removal cutting off events; archive read-only; default channel protections; group limits; old INTERNAL send returning 501. All passed.
  - A deactivated colleague's DM returns 409 while its history stays readable.
