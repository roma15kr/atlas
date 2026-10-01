# Design

## Context

- **Configuration today.** `TELEGRAM_BOT_TOKEN` exists in `config.ts` and only drives the "serverConfigured" status. `add-email-client` introduces the shared `GET /clients/:id/communications` and `GET /deals/:id/communications` endpoints and the "Переписка" card; this change adds a Telegram source to them. `add-team-chat` provides `realtime.ts` (`emitToUsers`).
- **Existing customer ids.** The company already has customers subscribed to its bot. It has their Telegram ids (called "device IDs" in the request) and knows which manager serves each one.
  - A bot can message a user only if that user has started *this* bot and not blocked it.
  - Ids the company holds for this bot are therefore usable directly.
  - Ids that came from a different bot or system won't be reachable. The import marks every row `UNVERIFIED` until the customer writes, and a failed send explains this.
- **One receiver per bot.** Telegram delivers a bot's updates to one receiver: a webhook or a `getUpdates` poller. If another system handles this bot today, it stops receiving messages when Atlas takes over.
- **Deployment.** The app runs as a single API process behind Coolify with HTTPS on `PUBLIC_URL`.

## Goals / Non-Goals

**Goals:**
- Reliable, idempotent receipt of customer messages, with media.
- Routing to the responsible manager, using the existing role-and-department scope model.
- A complete, CRM-visible history: every message of a linked contact shows on the client and on linked deals.

**Non-Goals:**
- Multiple bots per company.
- Telegram group chats and channels.
- Inline keyboards, bot menus or automated flows.
- Broadcasts or mailings to many customers.
- Managers linking their personal Telegram accounts, and notifications to Telegram.
- WhatsApp and Viber, which stay "not configured".
- Deleting messages on the customer's side.
- Message templates.

## Decisions

### Webhook by default, polling as a fallback
In `webhook` mode, the default, the API calls `setWebhook` at startup and whenever the director presses "Проверить подключение". The URL is `{PUBLIC_URL}/api/telegram/webhook`, outside `/api/v1`, with no session. The call sets `secret_token = TELEGRAM_WEBHOOK_SECRET` and `allowed_updates = [message, edited_message, my_chat_member]`.

The handler checks `X-Telegram-Bot-Api-Secret-Token` with a constant-time comparison, stores the update and answers 200 at once. Processing happens in the same request after the insert, and any failure is retried by a sweeper, so Telegram never sees slow responses.

In `polling` mode, for local development or a server without HTTPS, a runner long-polls `getUpdates` and holds a Postgres advisory lock, so only one instance polls. Both modes feed the same `handleUpdate`.

Idempotency comes from a unique `telegram_updates(update_id)` insert. A duplicate insert is a no-op. The `(contact_id, direction, telegram_message_id)` pair is also unique.

### Data model (`008_telegram_inbox.sql`)

**`telegram_settings`**

| Column | Notes |
| --- | --- |
| `company_id` | primary key |
| `bot_username` | |
| `greeting_text` | |
| `welcome_text` | |
| `default_responsible_id` | |
| `last_update_at` | |
| `last_error` | |
| `updated_by` | |
| `updated_at` | |

**`telegram_contacts`**

| Column | Notes |
| --- | --- |
| `id` | |
| `company_id` | |
| `telegram_user_id` | bigint |
| `username` | |
| `first_name` | |
| `last_name` | |
| `language_code` | |
| `client_id` | |
| `responsible_id` | |
| `department_id` | copied from the responsible user, for scope |
| `status` | `ACTIVE`, `BLOCKED` or `UNVERIFIED` |
| `bound_via` | |
| `greeted_at` | |
| `last_message_at` | |
| `created_at` | |

Unique `(company_id, telegram_user_id)`. One contact per Telegram user, and the private chat id equals the user id.

**`telegram_messages`**

| Column | Notes |
| --- | --- |
| `id` | |
| `contact_id` | |
| `direction` | |
| `telegram_message_id` | |
| `reply_to_message_id` | |
| `text` | |
| `kind` | `TEXT`, `PHOTO`, `DOCUMENT`, `VOICE`, `AUDIO`, `VIDEO`, `VIDEO_NOTE`, `STICKER`, `LOCATION`, `CONTACT` or `OTHER` |
| `file_id` | |
| `file_name` | |
| `mime_type` | |
| `file_size` | |
| `stored_path` | |
| `summary` | |
| `sent_by` | |
| `status` | `RECEIVED`, `SENDING`, `SENT` or `FAILED` |
| `error` | |
| `edited_at` | |
| `created_at` | |

**Other tables:**
- `telegram_reads (contact_id, user_id, last_read_at)`.
- `telegram_invites`:

  | Column | Notes |
  | --- | --- |
  | `id` | |
  | `company_id` | |
  | `client_id` | |
  | `created_by` | |
  | `token_hash` | |
  | `expires_at` | |
  | `used_at` | |
  | `used_by_contact` | |
  | `conflict_client_id` | |

- `telegram_deal_links (contact_id, deal_id, linked_at, linked_by)`.
- `telegram_updates (update_id, received_at, processed_at, error)`.

Updates are pruned after 7 days.

A contact is the conversation: one private chat per customer, so there is no separate conversation table. Deal links are a table because one customer can have several deals over time.

### Access = record scope over the responsible user
`telegramAccessSql` reuses `recordScope` with `owner = responsible_id` and `department = department_id`, plus a clause for unassigned contacts (`responsible_id IS NULL` → DIRECTOR or MANAGER).
- `department_id` is refreshed by a trigger when the responsible user changes or moves department.
- A users status trigger clears `responsible_id` for DISABLED users, which sends their contacts back to the queue.

Unknown or forbidden contacts return 404, consistent with boards and chat. Unlike mail, Telegram conversations are company channels, not personal mailboxes, so head and director access is intended.

### CRM history reads from the conversation, never from copies
The communications endpoints union email threads with Telegram contacts where `client_id = :client`, or, for deals, contacts in `telegram_deal_links`. Opening an entry returns that contact's full `telegram_messages`.

Because history is a query over the conversation by its current link:
- messages sent before linking appear automatically;
- relinking moves the whole conversation;
- new messages show up without any write to CRM tables.

The client communication history check (the caller can see the client or deal) grants read-only access even when the caller can't open the conversation in the Telegram screen.

Rejected: copying each message into a client activity table. That duplicates data and breaks on relink.

### Binding flows
- **Invite.** The token is 24 random bytes in base64url (32 characters, within the 64-character `start` limit). Only a SHA-256 hash is stored. `/start <token>` in the update handler:
  1. finds a valid invite;
  2. binds `client_id` and sets `responsible_id` to the creator (or the client's owner when the creator is outside the client's department scope);
  3. marks the invite used;
  4. sends `welcome_text`.

  If the contact already has a different client, the invite is marked with the conflicting client and the binding is unchanged.
- **Unknown sender.** The handler upserts the contact. When `default_responsible_id` is set, the contact is assigned to that user. Otherwise it stays unassigned. The greeting is sent once (`greeted_at`).
- **Import.** `POST /telegram/import/preview` parses the CSV with a small RFC 4180 parser in `telegram/csv.ts` (UTF-8 with BOM, comma or semicolon). It resolves clients by id, email or phone and responsible users by username within the caller's scope, and returns classified rows with a preview id held for 30 minutes. `POST /telegram/import/:previewId/apply` applies the valid rows in one transaction.
- **Unverified contacts.** Imported contacts keep `UNVERIFIED` until their first message. The bot isn't asked to verify each id, because `getChat` doesn't prove the user can be messaged, and 5000 calls would hit rate limits.

### Sending and media
- **Sending.** `sendMessage`, or `sendPhoto`/`sendDocument` through multipart upload for attachments, with `reply_parameters` for replies.
- **Errors.** A 403 "bot was blocked by the user" sets BLOCKED. A 400 "chat not found" on an UNVERIFIED contact returns `TELEGRAM_CONTACT_UNREACHABLE`. A 429 is retried after `retry_after`. Sends are serialized per chat and capped at 25 per second globally.
- **Media.** Incoming media is downloaded through `getFile` into `STORAGE_DIR/telegram/<contact>/<message>`, up to Telegram's 20 MB bot download limit. The download runs asynchronously after the message is stored, so the message appears at once and the file follows.
- **Block state.** `my_chat_member` updates flip BLOCKED and ACTIVE.

### API surface
**`/api/v1/telegram`:**
- **Settings:** `GET /status`; `PATCH /settings` and `POST /webhook/check` (DIRECTOR).
- **Conversations:**
  - `GET /contacts?filter=mine|unassigned|all&q=&cursor=`;
  - `GET /contacts/:id`;
  - `GET /contacts/:id/messages?before=`;
  - `POST /contacts/:id/messages` (multipart);
  - `POST /contacts/:id/read`;
  - `GET /files/:messageId`.
- **Triage and CRM:**
  - `PATCH /contacts/:id` for client and responsible;
  - `POST /contacts/:id/client`;
  - `POST /contacts/:id/deal`;
  - `DELETE /contacts/:id/deals/:dealId`.
- **Import:** `POST /import/preview` and `POST /import/:previewId/apply`.
- **Counts:** `GET /unread`.

**Other endpoints:**
- `POST /api/v1/clients/:id/telegram-invite`;
- `POST /api/telegram/webhook`, the public, secret-verified webhook.

### Web
**"Telegram" (`/telegram`)** follows `ui-design-system`:
- A `PageHeader` with a filter `Segmented` ("Мои / Неразобранные / Все"), search, and a settings `IconButton` for directors. There is no primary action, because conversations start from customers.
- A master list with avatar initials, name, client caption, unread badge and status badges ("Не подтверждён", "Заблокировал бота").
- The conversation `Surface` has a header row with the client, responsible user and actions (link client, reassign, create deal), the message list with attachments and the sender's name on replies, and a composer with an attachment button.

**Dialogs:**
- "Привязать к клиенту" and "Сменить ответственного" (`md`);
- "Создать сделку", reusing the deal dialog with the client preset;
- "Импорт контактов" (`lg`), with a file picker, a preview table, error rows and a primary "Импортировать N".

**"Настройки Telegram"** is a sub-page with bot status, webhook health, the greeting and welcome texts and the default responsible user, edited through dialogs.

**Elsewhere:**
- `ClientPage` gets "Пригласить в Telegram", which opens an `md` dialog with the link and a copy button, and Telegram entries in "Переписка".
- The navigation "Telegram" item shows its unread badge.

## Risks / Trade-offs

- **[Another system uses the bot today]** Setting the webhook cuts it off, and updates it didn't collect are lost if there is a gap. **Mitigation:** OPERATIONS gets a switch-over checklist: export the id-to-manager list from the old system, import it into Atlas, then switch the webhook in a quiet hour. Telegram keeps undelivered updates for 24 hours, so a short gap loses nothing.
- **[Imported ids from another bot are unreachable]** **Mitigation:** the `UNVERIFIED` status, a clear 409 on send, and an offer to send an invite link through another channel.
- **[The webhook endpoint is public]** **Mitigation:** the secret token check, strict body size (1 MB), IP-agnostic rate limiting, and no response data beyond 200 or 401.
- **[Customer data retention]** Telegram messages are personal data stored indefinitely with the client. **Mitigation:** deleting a client only unlinks its contacts (`client_id` set null), so conversations aren't lost. A director can delete a contact with all its messages and files from Telegram settings. A retention policy is out of scope and noted for later.
- **[Heads can read their employees' customer chats]** This is intended, because these are company customer channels, unlike private mail and DMs. It is stated in the specs.

## Migration Plan

1. Deploy with `TELEGRAM_BOT_TOKEN` unset. Migration `008` is additive, and the screens show "не настроен".
2. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` and `TELEGRAM_MODE=webhook`. Import the existing id-to-client-to-manager list while the old system still runs, since import needs no webhook.
3. Press "Проверить подключение" to register the webhook. Confirm with a test message from a staff Telegram account.
4. **Rollback:** unset the token, or call `deleteWebhook`. Tables stay, and the old system can re-register its webhook.

## Implementation notes

- **Company resolution:** the bot serves the deployment's first company (`botCompanyId`). Atlas deployments are single-company today.
- **Bot API base URL:** set by `TELEGRAM_API_BASE` (default `https://api.telegram.org`). Tests inject a fake fetch with `setTelegramFetch`.
- **Webhook route:** registered before the general per-IP rate limiter, because Telegram's traffic comes from a few shared IPs. The secret token authenticates it instead.
- **Unknown senders:** a `/start` without a valid token is stored as "Клиент начал диалог с ботом", so the queue shows that the customer opened the bot.
- **Invite visibility:** creating an invite requires seeing the client. Another employee's client therefore returns 404 rather than 403, like other scoped records.
- **Import previews:** they live in API memory for 30 minutes. With several API instances, the apply request must reach the same one.
- **Director deletion:** directors can delete a contact with its messages and files (`DELETE /telegram/contacts/:id`), audited as `TELEGRAM_CONTACT_DELETED`. This is the retention mitigation from the risks section.
- **Verification:**
  - `routes/telegram.integration.test.ts` (PGlite, real app, fake Bot API) covers the webhook secret, duplicate updates, greet-once, triage limits, the full history including earlier messages with the replying manager, deal history, single-use invites, block and unblock, import preview and apply with every error kind, the unreachable imported contact, photo download and edits, director-only settings with the new greeting and default responsible, and unread counts.
  - `pages/Telegram.test.tsx` covers the UI.
- **Test app:** deployed without a bot token. Remote checks passed: the channel reports not configured, the webhook refuses requests, the contacts list works, employees can't import, a head's import preview reports row errors, invites require a configured bot, and integration status shows Telegram unconfigured. Task 5.2 is still open because it needs a separate test bot token.
