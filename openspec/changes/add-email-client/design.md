# Design

## Context

- **There is no real mail today.** The `messages` table and `/api/v1/messages` are placeholders: no adapter was ever implemented, and `integrations` rows are only status records. `config.ts` already declares `GOOGLE_CLIENT_ID` and `MICROSOFT_CLIENT_ID`, but nothing uses them.
- **One API process** serves HTTP and Socket.IO. There is no job queue. Redis is optional. Files live on the documents volume (`STORAGE_DIR`) since `replace-minio-with-volume-storage`.
- **Chat plumbing is reused.** `add-team-chat` provides `realtime.ts` (`emitToUsers`), the `chat:user:<id>` socket rooms and the navigation structure this change builds on.
- **Deals now live in funnels** with their own access rules (`add-multiple-crm-funnels`). Creating a deal from mail must go through the same checks as `POST /deals`.
- **Scale:** about 20 users, heading to 100+, with at most 5 mailboxes each. A 90-day window is typically 1–10k messages per mailbox.

## Goals / Non-Goals

**Goals:**
- A dependable two-way IMAP/SMTP client that works with Gmail, Outlook and ordinary hosting mail through one code path.
- Mail stays private to its owner by default, and CRM visibility happens only through an explicit or automatic link that the owner can undo.
- Secrets are safe at rest and hostile HTML is harmless.

**Non-Goals:**
- Shared or department mailboxes such as `sales@` read by several people (possible later as a mailbox with extra members).
- Calendar invitations and contacts sync.
- Scheduled send, undo send and snooze.
- Mail rules and filters.
- Bulk campaigns or newsletters.
- Syncing Atlas drafts back to the server's Drafts folder.
- Fetching mail older than the sync window, except when a thread already in Atlas references it.
- Gmail and Microsoft Graph REST APIs.
- Mobile push notifications.

## Decisions

### IMAP/SMTP for every provider; OAuth only changes authentication
Google and Microsoft both support IMAP and SMTP with XOAUTH2. So the sync and send engine is one implementation: `imapflow` for IMAP, `nodemailer` for SMTP and `mailparser` for MIME. The OAuth providers only supply an access token, refreshed from the stored refresh token.

Rejected: the Gmail API and Microsoft Graph. They are better in places (history ids, push), but they mean three sync engines to build and test for about 20 users.

| | Google | Microsoft |
| --- | --- | --- |
| Scopes | `https://mail.google.com/` plus `email` | `https://outlook.office.com/IMAP.AccessAsUser.All`, `https://outlook.office.com/SMTP.Send`, `offline_access`, `email` |
| Endpoint | | tenant from `MICROSOFT_TENANT_ID`, default `common` |
| Hosts and ports | `imap.gmail.com:993`, `smtp.gmail.com:465` | `outlook.office365.com:993`, `smtp.office365.com:587` STARTTLS |

- The redirect URI is `{PUBLIC_URL}/api/v1/mail/oauth/{google|microsoft}/callback`.
- The `state` is an HMAC-signed `{userId, nonce, exp: 10 min}`. The callback also requires the caller's session to be that user, and the nonce is single-use in Postgres.

### Credentials: AES-256-GCM with a key id
`MAIL_ENCRYPTION_KEY` is 32 bytes, base64. Secrets are stored as `{keyId, iv, tag, ciphertext}`. Adding `MAIL_ENCRYPTION_KEY_PREVIOUS` allows rotation: records are decrypted with either key and re-encrypted on the next token refresh or edit. Without a key, connect endpoints return 503, and integration status reports mail as unconfigured.

Rejected: storing secrets in the `integrations.metadata` JSON, and Postgres `pgcrypto`, which would put the key in SQL.

### Host safety (SSRF)
Users type IMAP and SMTP hosts, so the API resolves them before connecting and rejects private, loopback, link-local and metadata ranges (IPv4 and IPv6) unless `MAIL_ALLOW_PRIVATE_HOSTS=true`. It connects to the resolved address with SNI set to the hostname, which prevents DNS rebinding, and allows only ports 993, 143, 465, 587 and 25. The connection test and sync use the same guarded connector.

### Sync engine
A `MailScheduler` starts with the API.
- **Scheduling:** every 30 s it picks due mailboxes. Inbox is due after 2 min, or at once on "Обновить"; other folders after 10 min. It runs at most 5 concurrently.
- **Locking:** each mailbox sync holds `pg_try_advisory_lock(hash(account_id))`, so a second API instance or a rolling deploy never syncs the same mailbox twice.
- **Per folder:**
  - If `UIDVALIDITY` changed, drop that folder's local messages and refetch the window.
  - Fetch UIDs above `last_uid` within `SINCE now-MAIL_SYNC_DAYS`.
  - Refresh flags for known UIDs: `CHANGEDSINCE modseq` when the server supports CONDSTORE, otherwise flags for the newest 500 UIDs, with UIDs missing from the server removed.
  - Bodies are fetched with the envelope. Attachments are listed but downloaded only on demand into `STORAGE_DIR/mail/<account>/<message>/<part>`.
- **Failures:** an authentication error sets NEEDS_ATTENTION with a Russian reason, emits `mail:account` and pauses the mailbox. Network errors back off exponentially up to 30 min.
- **Scope:** IMAP IDLE isn't used in v1. Polling keeps connection counts predictable, and 2 min meets the requirement.

Rejected: a separate worker container, which adds a deployment unit. The scheduler is isolated behind a module so it can move to its own container later.

### Data model (`007_email_client.sql`)

**`mail_accounts`**

| Column | Notes |
| --- | --- |
| `id` | |
| `company_id` | |
| `user_id` | |
| `provider` | `IMAP`, `GOOGLE` or `MICROSOFT` |
| `email` | |
| `display_name` | |
| `imap_host`, `imap_port`, `imap_security` | |
| `smtp_host`, `smtp_port`, `smtp_security` | |
| `username` | |
| `secret` | encrypted, jsonb |
| `signature` | |
| `status` | |
| `status_reason` | |
| `last_synced_at` | |
| `created_at` | |

Unique `(user_id, lower(email))`.

**`mail_folders`**

| Column | Notes |
| --- | --- |
| `id` | |
| `account_id` | |
| `path` | |
| `name` | |
| `special_use` | |
| `uidvalidity` | |
| `last_uid` | |
| `highest_modseq` | |
| `total` | |
| `unread` | |
| `synced_at` | |

**`mail_threads`**

| Column | Notes |
| --- | --- |
| `id` | |
| `account_id` | |
| `subject` | |
| `participants` | `text[]` of lowercased addresses |
| `last_message_at` | |
| `message_count` | |
| `unread_count` | |
| `has_attachments` | |
| `client_id` | |
| `deal_id` | |
| `link_source` | `AUTO` or `MANUAL` |
| `autolink_blocked` | |
| `provider_thread_id` | |

**`mail_messages`**

| Column | Notes |
| --- | --- |
| `id` | |
| `account_id` | |
| `folder_id` | nullable, for linked history kept after disconnect |
| `thread_id` | |
| `uid` | |
| `message_id_header` | |
| `in_reply_to` | |
| `references` | |
| `from_address`, `from_name` | |
| `to`, `cc`, `bcc`, `reply_to` | |
| `subject` | |
| `snippet` | |
| `text_body` | |
| `html_body` | sanitized |
| `sent_at` | |
| `seen`, `flagged`, `answered` | |
| `size` | |
| `search` | `tsvector` over subject, addresses and text, with `simple` config, which handles mixed Russian and English |
| `send_status` | nullable: `SENDING`, `SENT` or `FAILED` |

Unique `(folder_id, uid)`.

**`mail_attachments`**

| Column | Notes |
| --- | --- |
| `id` | |
| `message_id` | |
| `part_id` | |
| `filename` | |
| `content_type` | |
| `size` | |
| `content_id` | |
| `inline` | |
| `stored_path` | nullable |

**`mail_drafts`**

| Column | Notes |
| --- | --- |
| `id` | |
| `account_id` | |
| `user_id` | |
| `mode` | `NEW`, `REPLY`, `REPLY_ALL` or `FORWARD` |
| `source_message_id` | |
| `to`, `cc`, `bcc` | |
| `subject` | |
| `html` | |
| `attachments` | jsonb of uploaded temp files and forwarded parts |
| `updated_at` | |

Thread-level linking (`client_id` and `deal_id` on `mail_threads`) matches how people think about correspondence. Per-message linking was rejected because it fragments client history.

The migration also drops `messages` and its three enum types. `integrations` stays for company-level providers such as Telegram.

### Threading
In order of precedence:
1. Gmail `X-GM-THRID`, when the server advertises `X-GM-EXT-1`.
2. A `References`/`In-Reply-To` lookup against known `message_id_header`s in the same mailbox.
3. The same normalized subject (`Re:`, `Fwd:`, `Ответ:`, `Пересл:` stripped) with an overlapping participant within 30 days.

Threads are per mailbox, never merged across mailboxes, which keeps privacy boundaries simple.

### HTML safety
The server sanitizes HTML once on ingest with `sanitize-html` and an allowlist of formatting tags and attributes, with no scripts, forms, iframes, event handlers or `javascript:` URLs. Remote `src` values are rewritten to `data-remote-src`.

The web app renders the result in an `<iframe sandbox>` (no `allow-scripts`, no `allow-same-origin`) through `srcdoc`, with a CSP meta tag of `img-src data: cid:` until the user allows images. Allowing images swaps `data-remote-src` back for that message only. `cid:` images are served from the owner-only attachment endpoint.

### CRM linking rules
- **Automatic linking** runs after sync inserts or updates a thread with no link and `autolink_blocked = false`. It matches the thread's non-owner participants against `lower(clients.email)`, within the owner's client scope (`recordScope` on clients). Exactly one match links the thread with `AUTO`; several matches are stored as suggestions and returned with the thread.
- **Manual changes** record `MANUAL`. Unlinking sets `autolink_blocked`.
- **Deal links** check deal visibility with the funnel-aware deal access predicate and set `client_id` from the deal.
- **"Создать клиента" and "Создать сделку"** call the same service functions as `POST /clients` and `POST /deals`, so validation, currency, funnel access and audit stay identical, then link the thread.

### Visibility of linked history
`GET /clients/:id/communications` and `GET /deals/:id/communications` first check that the caller can see the client or deal, using the existing scope. They then return linked threads from any mailbox. The read-only thread endpoint `GET /communications/mail/:threadId` checks: owner, or the thread's client or deal visible to the caller. It returns messages without Bcc for non-owners, and allows attachment download.

Everything under `/api/v1/mail/*` is owner-only and filtered by `mail_accounts.user_id = caller`, never by role.

### Sending
1. `POST /mail/send` builds MIME with `nodemailer` from a draft id. It sets `In-Reply-To`/`References` from the source message, the signature and attachments.
2. It stores a `mail_messages` row with `send_status = SENDING` in the thread, which shows at once.
3. It submits over SMTP.
4. It appends to the Sent folder unless the provider is Google or Microsoft, which save it themselves.
5. It marks the message SENT and deletes the draft.
6. On failure it marks the message FAILED, keeps the draft and returns the SMTP reason mapped to Russian.

The rate limit is 100 sends per hour per user, counted in Postgres.

### API surface (`/api/v1/mail`, owner-only)
- **Mailboxes:**
  - `GET /accounts`;
  - `POST /accounts/test` and `POST /accounts` (IMAP);
  - `GET /oauth/:provider/start` and `GET /oauth/:provider/callback`;
  - `PATCH /accounts/:id` (name, signature, IMAP settings or password);
  - `POST /accounts/:id/sync`;
  - `DELETE /accounts/:id`.
- **Reading:**
  - `GET /accounts/:id/folders`;
  - `GET /threads?accountId&folderId&cursor&q`;
  - `GET /threads/:id`;
  - `GET /attachments/:id`.
- **Actions:**
  - `POST /actions` with `{ ids, target: 'thread' | 'message', action: 'read' | 'unread' | 'star' | 'unstar' | 'move' | 'archive' | 'spam' | 'trash' | 'delete', folderId? }`;
  - `POST /messages/:id/show-images`, which returns the unblocked HTML for that message.
- **Compose:**
  - `GET|POST|PATCH|DELETE /drafts`;
  - `POST /drafts/:id/attachments` (multipart);
  - `POST /send`.
- **CRM:**
  - `PATCH /threads/:id/link` with `{ clientId?, dealId? }` or `null`;
  - `POST /threads/:id/client`;
  - `POST /threads/:id/deal`.
- **Suggestions and counts:**
  - `GET /suggest?q=` for addresses from visible clients and past correspondents;
  - `GET /unread`.

Outside `/mail`:
- `GET /clients/:id/communications`;
- `GET /deals/:id/communications`;
- `GET /communications/mail/:threadId`.

### Web
**"Почта" (`/mail`)** follows `ui-design-system`:
- A `PageHeader` with the mailbox switcher (a compact select when there are several), a search field, an "Обновить" `IconButton`, a settings `IconButton` and the single primary "Написать".
- Three cards side by side:
  - the folder list, as a master list with unread badges;
  - the thread list, as selectable rows with correspondents, subject, snippet, time, star and a client chip;
  - the reading pane, showing messages in the thread, a sandboxed HTML frame, an attachment list, a linked client or deal row with "Изменить", and the actions "Ответить", "Ответить всем" and "Переслать" plus row icon actions.
- A notice banner appears when a mailbox needs attention.

**Composer:** an `lg` dialog with From, To, Cc, Bcc, Subject, a small formatting toolbar, attachments, and "Отправить" as the primary action. Closing the composer saves the draft.

**"Настройки почты" (`/mail/settings`):** a sub-page with a back link, a list of mailboxes (status badges, last sync, edit and disconnect icons) and a "Подключить ящик" dialog. The dialog offers Google, Microsoft and "Другая почта" (an IMAP/SMTP form with "Проверить подключение"). It also covers the signature.

**Elsewhere:**
- `ClientPage` and the deal view get a "Переписка" `Surface`. It opens linked threads read-only in an `lg` dialog.
- `ClientPage`'s "Написать" opens the composer with the client's email.
- The "Почта" navigation badge uses `/mail/unread` and live `mail:*` events.
- The `/inbox` route and `InboxPage` are removed.

## Risks / Trade-offs

- **[Google restricted scope]** `https://mail.google.com/` requires Google app verification for external user types. **Mitigation:** register the OAuth app as *Internal* in the company's Google Workspace, where no verification is needed, and document this. Personal Gmail users can use IMAP with an app password.
- **[Microsoft tenants may disable SMTP AUTH]** **Mitigation:** the connection test reports this explicitly, and OPERATIONS explains how an admin enables SMTP AUTH per mailbox.
- **[Polling load with 100 users × 5 mailboxes]** **Mitigation:** there is a concurrency cap of 5, and inbox polling can be slowed through `MAIL_POLL_SECONDS`. IDLE can be added later without changing the model.
- **[Mail volume grows the database]** **Mitigation:** there is a 90-day window, and attachments stay on the server until opened. Bodies of messages that fall out of the window and are unlinked are pruned nightly by the scheduler.
- **[Auto-linking could expose a private email to the head]** **Mitigation:** only exact address matches against clients the owner already sees are linked, the owner can unlink permanently, and the thread shows a visible "Привязано к клиенту" row. This is stated in the privacy requirement.
- **[Losing the encryption key makes stored credentials unreadable]** **Mitigation:** mailboxes go to NEEDS_ATTENTION and can be reconnected, and no mail is lost. OPERATIONS tells operators to back up the key with the other secrets.

## Migration Plan

1. **Before deploy:**
   - Run `SELECT channel, count(*) FROM messages GROUP BY 1` on production and record the result.
   - Take the pg_dump required by OPERATIONS.
   - Set `MAIL_ENCRYPTION_KEY` and, optionally, the Google and Microsoft secrets in Coolify.
2. Deploy. Migration `007` creates the mail tables and drops `messages`, and the scheduler starts idle because no mailboxes exist yet.
3. Users connect mailboxes from "Почта → Настройки".
4. **Rollback:** redeploy the previous image. Its `/messages` endpoint would fail without the table, so rollback also needs a follow-up migration that recreates `messages` empty, or a restore from the dump. Never edit `007`.

## Open Questions

- Should the director get an explicit, audited "view mailbox" override for compliance? The current answer is no, the same as chat. It can be added later as a separate audited feature without changing this design.

## Implementation notes

- **OAuth redirect:** it lands on the web route `/mail/oauth/:provider`, not an API callback. The API authenticates with a Bearer token that a browser redirect can't carry, so the page posts `code` and `state` to `POST /api/v1/mail/oauth/:provider/complete` with the user's own token, and the state is bound to that user.
- **Mail frame sandbox:** the frame uses `sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"`, without `allow-scripts`. Same-origin access is needed only so the page can size the frame to its content. With no script permission and server-side sanitizing, mail code can't run.
- **Image policy:** a `srcdoc` frame inherits the page's CSP, so nginx's `img-src` now includes `https:`. The frame's own CSP still blocks remote images until the owner chooses "Показать изображения".
- **Inline images:** inline `cid:` images up to 512 KB are converted to data URIs on ingest, because the sandboxed frame can't send the API token.
- **Attachments:** they are cached through the existing object storage (volume or S3) rather than raw paths. The cache is used on first download, for outgoing mail, and for linked threads before a mailbox is disconnected.
- **Shared creation code:** `createClient` and `createDeal` were extracted from the clients and deals routers so mail (and Telegram) apply identical validation, scope checks and audit.
- **Test harness:** `src/test/mailHarness.ts` runs PGlite with the real migrations, hoodiecrow (in-memory IMAP) and `smtp-server` in-process. `mail/mail.integration.test.ts` covers sync, windowing, flags from other clients, archive, reply threading, Sent de-duplication, SMTP failure and auth-failure pause. `routes/mail.integration.test.ts` covers the API end to end.
- **Not covered by automated tests:** the scheduler's cross-process lock (PGlite has one session, so it is unit-tested with a mocked lock) and a UIDVALIDITY reset (hoodiecrow can't change it).
