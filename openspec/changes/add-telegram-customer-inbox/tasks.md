# Tasks

## 1. Database and configuration

- [x] 1.1 Add `database/008_telegram_inbox.sql`. Verify on PGlite with demo data and on an empty database, including a trigger test that disabling a user unassigns their contacts.
  - Tables `telegram_settings`, `telegram_contacts`, `telegram_messages`, `telegram_reads`, `telegram_invites`, `telegram_deal_links` and `telegram_updates`.
  - Unique constraints and indexes.
  - Triggers: sync `department_id` from the responsible user, and unassign contacts of DISABLED users.
- [x] 1.2 Add `database/008_telegram_inbox_seed.sql`, demo only: bound, unassigned, unverified and blocked contacts with messages, one linked to a demo client and deal. Verify that a seeded database lists them per role.
- [x] 1.3 Add `TELEGRAM_WEBHOOK_SECRET` and `TELEGRAM_MODE` to `config.ts` and `.env.example`. Verify with a config test that webhook mode requires a secret of at least 32 characters when a token is set.

## 2. Telegram core

- [x] 2.1 `telegram/botApi.ts`: a typed `fetch` client for `getMe`, `setWebhook`, `getWebhookInfo`, `getUpdates`, `sendMessage`, `sendPhoto`, `sendDocument` and `getFile`, with 429 retry and a global send cap. Verify with unit tests against a mocked Bot API.
- [x] 2.2 `telegram/handleUpdate.ts`: idempotent update storage, contact upsert, message kinds and summaries, edits, `my_chat_member` block and unblock, `/start` with and without a valid, used, expired or conflicting token, greeting once, default responsible, and realtime emits. Verify with unit tests for each branch, including duplicate `update_id`.
- [x] 2.3 The webhook route with constant-time secret check and body limit, the polling runner with advisory lock, the failed-update sweeper and `telegram_updates` pruning. Verify with supertest that a missing or wrong secret gives 401 and nothing is stored, and with a polling-runner test using a mocked `getUpdates`.
- [x] 2.4 `telegram/media.ts`: asynchronous download to the volume within the size limit and the too-large placeholder. Verify with a unit test using a mocked `getFile`.
- [x] 2.5 `telegram/csv.ts` and import classification. Verify with unit tests for BOM, semicolons, quoted fields, invalid ids, invisible clients, out-of-scope responsible users, conflicts and duplicate rows.

## 3. API

- [x] 3.1 Add `telegramAccessSql` in `scope.ts` with tests for director, manager and employee against assigned, unassigned and other-department contacts.
- [x] 3.2 Conversation endpoints: list with filters and unread counts, detail, messages, send (text and attachment, reply-to, BLOCKED and UNREACHABLE handling), read, file download and unread totals. Verify with supertest: an employee sees only their own contacts, a head replies for an employee, a blocked contact gives 409, and `TELEGRAM_MESSAGE_SENT` is audited without text.
- [x] 3.3 Triage and CRM: bind or relink a client, reassign the responsible user within the role rules, create a client, create a deal through the shared deal service, and unlink a deal. Verify with tests for the manager's department limit and the audited denial.
- [x] 3.4 Invites (`POST /clients/:id/telegram-invite`), settings (director only), webhook check and status. Verify with tests: hashed tokens only, an employee gets 403 on settings, and status reports the bot username and last error.
- [x] 3.5 Import preview and apply with scope checks and audit counts. Verify with tests for the preview-without-save and apply-only-valid-rows scenarios.
- [x] 3.6 Add Telegram sources to `GET /clients/:id/communications`, `GET /deals/:id/communications` and a read-only `GET /communications/telegram/:contactId`. Verify with tests: messages from before linking appear, relinking moves the history, and a user who sees the client but not the conversation can read it there.
- [x] 3.7 Documentation. Verify the checklist against the test app bot.
  - `docs/OPERATIONS.md`: variables, the webhook versus polling choice, the switch-over checklist from an existing bot receiver, import format and rollback.
  - `docs/ARCHITECTURE.md`: model, access and history rules.
  - The README.

## 4. Web

- [x] 4.1 Telegram types, API client calls, demo data, and `AppContext` state with `telegram:*` socket events and the navigation badge. Verify with unit tests of the state updates.
- [x] 4.2 `TelegramPage`: filters, search, conversation list with status badges, the conversation view with media and sender names, the composer with attachment, and the blocked or unreachable notices. Verify with Testing Library in demo mode: an employee sees only their customers, replies, and the unread count clears.
- [x] 4.3 Dialogs: link client, reassign, create client, create deal, and import with the preview table. Verify with tests: a head can't pick another department's user, and import errors are shown per row.
- [x] 4.4 `TelegramSettingsPage` (director only), plus "Пригласить в Telegram" and the Telegram entries in "Переписка" on `ClientPage` and the deal view. Verify with tests: an employee is redirected from settings, and client history shows Telegram messages with the replying manager's name.
- [x] 4.5 Headless screenshots of the Telegram screen, import preview, settings and client history at desktop and 400px widths, checked against the `ui-design-system` rules.

## 5. Verification

- [x] 5.1 Run `npm run typecheck && npm test && npm run build` and `openspec validate add-telegram-customer-inbox --strict`. All must pass.
- [ ] 5.2 End-to-end on the test app with a separate test bot (never the production bot):
  - an unknown sender reaches the queue and gets the greeting;
  - triage binds the contact;
  - an invite link binds a second account;
  - a reply with a photo arrives;
  - block and unblock work;
  - the messages appear on the client and deal history.

  Record the results in `design.md` implementation notes.
