# Tasks

## 1. Database and configuration

- [x] 1.1 Add `database/007_email_client.sql`. Verify on PGlite with demo data and on an empty database that the migration applies and a thread can be inserted and found by search.
  - Tables `mail_accounts`, `mail_folders`, `mail_threads`, `mail_messages`, `mail_attachments` and `mail_drafts`.
  - Indexes, the unique constraints and the `search` tsvector with its GIN index.
  - Drop `messages` and the `message_channel`, `message_direction` and `message_delivery_status` types.
- [x] 1.2 Add `database/007_email_client_seed.sql`, demo only: one IMAP-style mailbox for the demo manager with folders and threads, one of them linked to a demo client. Verify that a seeded database shows them through the API.
- [x] 1.3 Add `MAIL_ENCRYPTION_KEY`, `MAIL_ENCRYPTION_KEY_PREVIOUS`, `MAIL_SYNC_DAYS`, `MAIL_POLL_SECONDS`, `MAIL_ALLOW_PRIVATE_HOSTS`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_SECRET` and `MICROSOFT_TENANT_ID` to `config.ts` and `.env.example`. Verify with a config test that a malformed key fails startup and that a missing key only disables mail.
- [x] 1.4 Add the `imapflow`, `nodemailer`, `mailparser` and `sanitize-html` dependencies (with their types). Verify that `npm install` and `npm run typecheck` pass.

## 2. Mail core modules

- [x] 2.1 `mail/crypto.ts`: AES-256-GCM seal and open with key ids and rotation. Verify with unit tests: round trip, a tampered tag rejected, and the previous key still opens.
- [x] 2.2 `mail/hosts.ts`: the resolve-and-guard connector (private ranges, IPv6, port allowlist). Verify with unit tests covering 10/8, 127/8, 169.254/16, ::1, fc00::/7, a public address, and the override flag.
- [x] 2.3 `mail/sanitize.ts`: HTML sanitizing and remote-image deferral. Verify with unit tests for scripts, event handlers, `javascript:` URLs, forms and iframes removed, and remote `src` moved to `data-remote-src`.
- [x] 2.4 `mail/threading.ts`: subject normalization and thread resolution by provider id, references and subject. Verify with unit tests, including Russian reply prefixes.
- [x] 2.5 `mail/oauth.ts`: Google and Microsoft authorization URLs, the signed single-use state, code exchange and token refresh. Verify with unit tests using a mocked token endpoint, covering invalid, expired and replayed state.

## 3. Sync and send

- [x] 3.1 `mail/imap.ts` and `mail/sync.ts`: connect with a password or XOAUTH2, list folders, initial windowed fetch, incremental UIDs, flag refresh with and without CONDSTORE, UIDVALIDITY reset, and auth-failure status. Verify with integration tests against an in-process IMAP test server (or a GreenMail container in CI), and record the chosen harness in `design.md`.
- [x] 3.2 `mail/scheduler.ts`: due selection, concurrency cap, advisory locks, back-off, `mail:*` realtime emits and the nightly prune. Verify with unit tests using fake timers and a test that two schedulers don't sync the same mailbox.
- [x] 3.3 `mail/send.ts`: MIME build from a draft (reply headers, signature, attachments, forwarded parts), SMTP submit, append to Sent for IMAP providers, status transitions, error mapping and the rate limit. Verify with tests against a local SMTP capture server, covering headers, attachments, and FAILED keeping the draft.

## 4. API

- [x] 4.1 `routes/mail.ts` mailbox endpoints: test, create, OAuth start and callback, update, sync, and disconnect with linked-history retention and OAuth revoke. Verify with supertest: wrong password gives 400, a duplicate email is rejected, no secret in any response, unavailable providers give 501, disconnect keeps linked threads, and the audit events have no addresses.
- [x] 4.2 Reading endpoints: folders, threads with cursor and search, thread detail marking read, attachment download, and show-images. Verify with tests that another user, including a director, gets 404 and that attachments download with the attachment disposition.
- [x] 4.3 Actions endpoint: every action mapped to IMAP operations with rollback on failure. Verify with tests against the IMAP test server.
- [x] 4.4 Drafts, attachment upload, send and suggestions. Verify with tests for the draft lifecycle, the 429 limit, the send from a NEEDS_ATTENTION mailbox giving 409, and suggestions limited to visible clients.
- [x] 4.5 CRM linking: automatic link after sync, suggestions on several matches, manual link, unlink blocking auto-link, deal link, create client and create deal through the shared services. Verify with tests: out-of-scope client or deal gives 404, and a deal created in an inaccessible funnel is rejected exactly as by `POST /deals`.
- [x] 4.6 `GET /clients/:id/communications`, `GET /deals/:id/communications` and `GET /communications/mail/:threadId`. Verify with tests that a manager reads a department employee's linked thread without Bcc, and that an employee gets 404 for another employee's client.
- [x] 4.7 Rework `routes/integrations.ts` for mail providers and the caller's mailboxes, and remove `routes/messages.ts` and its registration. Verify that the integration tests cover the "mail key missing" scenario.
- [x] 4.8 Documentation. Verify the documented Coolify steps against the test app.
  - `docs/OPERATIONS.md`: the new variables, key backup, Google Workspace Internal OAuth app setup, Microsoft app registration and SMTP AUTH, the pre-deploy count and dump for `007`, and the mail cache on the volume.
  - `docs/ARCHITECTURE.md`: the mail model, privacy rule, sync and HTML safety.
  - The README.

## 5. Web

- [x] 5.1 Mail types, API client calls, demo data, and `AppContext` mail state with `mail:*` socket handling and the unread badge. Verify with unit tests of the state updates.
- [x] 5.2 `MailPage`: folders, thread list, reading pane with the sandboxed HTML frame and "Показать изображения", attachments, actions and bulk actions, search, and the needs-attention banner. Verify with Testing Library in demo mode: open a thread, archive it, and check that remote images are not loaded until allowed.
- [x] 5.3 The composer dialog: new, reply, reply all and forward, recipients with suggestions, the formatting toolbar, attachments, draft autosave and error display. Verify with tests: reply prefills recipients and subject, closing keeps a draft, and a server error stays in `form-error`.
- [x] 5.4 `MailSettingsPage` and the connect dialog: Google, Microsoft and IMAP/SMTP with the connection test, plus edit, signature and disconnect confirmation. Verify with tests: unavailable providers are disabled, and a failed test shows the Russian reason.
- [x] 5.5 CRM integration: the "Переписка" card on `ClientPage` and the deal view with a read-only thread dialog, the link, create-client and create-deal dialogs from a thread, "Написать" on the client, and removal of `InboxPage` and `/inbox`. Verify with tests for linking a thread, creating a deal from a thread, and the history appearing on the client.
- [x] 5.6 Headless screenshots of the mail screen, composer, settings and client "Переписка" at desktop and 400px widths, checked against the `ui-design-system` rules.

## 6. Verification

- [x] 6.1 Run `npm run typecheck && npm test && npm run build` and `openspec validate add-email-client --strict`. All must pass.
- [ ] 6.2 End-to-end on the test app with a real test mailbox (IMAP app password), and with Google OAuth if credentials are provided:
  - receive, reply, archive, delete;
  - check the changes in the provider's web UI;
  - auto-link to a client;
  - read the linked history as a manager;
  - disconnect.

  Record the results in `design.md` implementation notes.
