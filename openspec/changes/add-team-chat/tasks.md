# Tasks

## 1. Database

- [x] 1.1 Add `database/006_team_chat.sql`. Verify on PGlite with demo data and on an empty database: one "Общий" per company, every ACTIVE user a member, directors admins.
  - Tables `chat_conversations`, `chat_members`, `chat_messages` and `chat_mentions`.
  - The CHECK constraints, the DM and channel-name unique indexes, and the message indexes.
  - Default "Общий" channels with a member backfill.
  - Triggers: users insert adds the user to "Общий"; users status or role update removes a DISABLED user from groups and channels and syncs default-channel adminship.
- [x] 1.2 Add `database/006_team_chat_seed.sql`, which is applied only with `SEED_DEMO_DATA` like other `*_seed.sql` files and sorts after `006_team_chat.sql`. It adds a sample channel, a group and DMs. Verify that a seeded local database lists them and that the checksums of already-applied migrations are unchanged.

## 2. Access and realtime plumbing

- [x] 2.1 Add `chatAccessSql`, `chatManageSql` and `canAccessConversation` in `scope.ts` and `access.ts`, with unit tests for director, manager and employee against DM, group, public, private, archived and default channels (including "director can't read private or DM").
- [x] 2.2 Add `realtime.ts`: the socket server holder with `emitToUsers`, a no-op in tests. In `socket.ts`, join `chat:user:<id>` rooms. Verify with a socket test that a user receives only events emitted to their room.

## 3. Chat API

- [x] 3.1 `routes/chat.ts`: people, conversations list with unread, mention and last-message data, DMs and groups. Verify with supertest: one DM per pair, the 3–20 group limit, cross-company users rejected, and 404 for non-participants.
- [x] 3.2 Channels: create, update, archive and unarchive, browse, join and leave, members and admin roles. Verify with tests for the employee-create denial (audited), duplicate names, public-to-private access loss, `CHAT_LAST_ADMIN`, the default channel's fixed rules, and director management without message access.
- [x] 3.3 Messages: list with cursor, post, reply (thread counters), edit, delete, moderation, and the archived-conversation and disabled-DM guard. Verify with tests for `CHAT_INVALID_PARENT`, edit-own-only, moderated delete audited without text, and blanked body on delete.
- [x] 3.4 Mentions, read state and mute: mention parsing and resolution, `@channel` permission, `GET /mentions`, `POST read`, muted totals. Verify with tests: no mention for users outside a private channel, and unread counts excluding own and deleted messages.
- [x] 3.5 Realtime emits from every write route to the resolved audience. Verify with tests that a removed member gets no further events and that a private channel's events reach only members.
- [x] 3.6 Add a posting rate limit and remove the INTERNAL send path from `routes/messages.ts` (now 501 and audited). Update `routes/messages` tests and verify they pass.
- [x] 3.7 Update `docs/ARCHITECTURE.md` (chat model, access rules, realtime events, the director privacy decision) and the README feature list. Verify that the docs name every endpoint group.

## 4. Web

- [x] 4.1 Add chat types, API client calls, demo data, and `AppContext` chat state with socket event handling and reconnect re-fetch. Verify with unit tests of the reducer for new, edited and deleted messages and read events.
- [x] 4.2 Move the current customer inbox to `InboxPage` at `/inbox`, add the navigation entry, and point the client card's "Написать" there. Verify that the existing inbox behavior is unchanged in tests.
- [x] 4.3 Build the chat `MessagesPage` following `ui-design-system`: the conversation list, conversation view, composer with mention autocomplete, thread panel, and a real unread badge in navigation. Verify with Testing Library in demo mode: open a DM, post, reply in a thread, and watch the unread badge clear on open.
- [x] 4.4 Build the dialogs: new message (DM or group), new channel, channel settings (members and admins), browse channels (join, archived), and leave, archive and delete confirmations. Verify with tests: the employee sees no "Новый канал", a manager creates a private channel and adds a member, and the last-admin error shows in `form-error`.
- [x] 4.5 Take headless screenshots of the chat, a thread and channel settings at desktop and 400px widths, and check them against the Team screen and the `ui-design-system` rules.

## 5. Verification

- [x] 5.1 Run `npm run typecheck && npm test && npm run build` and `openspec validate add-team-chat --strict`. All must pass.
- [x] 5.2 End-to-end against a local API with two browser sessions (director and employee): a live DM, a mention badge, private channel visibility, and removal cutting off events. Record the results in `design.md` implementation notes.
