# Proposal

## Why

The company already talks to many customers through its Telegram bot, and each of those customers is assigned to a specific manager. That correspondence lives outside Atlas: a manager's head can't see it, it isn't attached to the client or deal, and when a manager is away nobody else can answer. Atlas should receive these customers' Telegram messages, route each conversation to its responsible manager, let managers reply from Atlas, and keep the whole history with the CRM client.

## What Changes

- **Company bot connection.** The company's bot token is configured on the server. Atlas receives updates through a verified webhook, or through long polling where the server has no HTTPS. The director sees the bot's name and connection health, and edits the greeting texts.
- **Customer contacts.** Every private chat with the bot becomes a Telegram contact. A contact has the customer's Telegram id and name, an optional linked CRM client and a responsible user. Customers are bound in three ways:
  - **Import** of the Telegram ids the company already has (CSV: Telegram id, client, responsible manager), with a preview before applying. Directors import for anyone; heads import for their own department.
  - **Invite link.** On a client card, "Пригласить в Telegram" creates a personal `t.me/<bot>?start=…` link. When the customer opens it, the chat is bound to that client and its responsible manager automatically.
  - **Unknown senders** land in a "Неразобранные" queue. Directors and heads bind them to a client and a responsible person, or create a new client. The director can set a default responsible person for new unknown contacts.
- **Inbox and replies.** A new "Telegram" screen lists conversations: "Мои", "Неразобранные", and everything the user may see. Each has unread counts and live updates. The user reads messages there, including photos, documents, voice notes and video, and replies with text and attachments. The customer receives the replies from the company bot. Atlas records which user replied.
- **Access.** A conversation follows record scope through its responsible user: the responsible person, the head of that person's department, and directors can read and reply. Directors reassign any conversation; heads reassign within their department.
- **CRM history.** Every Telegram message with a linked customer, incoming and outgoing, is recorded in the client's CRM history ("Переписка"), next to email. That includes messages from before the link was made and the name of the manager who replied, and the same messages appear on linked deals. Everyone who can see the client can read it there. From a conversation a user can link a client, create a client, or create a deal.
- **Delivery state.** When a customer blocks the bot, the contact is marked "Заблокировал бота" and sending is refused with a clear message. When they return, the contact is active again.
- Replies happen only in Atlas. Managers don't need to link their own Telegram accounts.

## Capabilities

### New Capabilities
- `telegram-inbox`: covers
  - the bot connection and webhook security;
  - Telegram contacts and their binding by import, invite link or manual triage;
  - responsible-user routing and access rules;
  - receiving and sending messages with media;
  - read state and live updates;
  - blocked customers;
  - CRM links;
  - Telegram audit events.

### Modified Capabilities
None. The shared "Client communication history" and "Integration status" requirements of `messaging-integrations`, as rewritten by `add-email-client`, already cover a Telegram channel generically. This change only supplies it.

## Impact

- **Database:**
  - migration `008_telegram_inbox.sql` adds `telegram_settings`, `telegram_contacts`, `telegram_messages`, `telegram_reads` and `telegram_invites`;
  - a demo-only `008_telegram_inbox_seed.sql`.
- **API:**
  - a new `routes/telegram.ts`;
  - `telegram/` modules for the Bot API client, update handling, webhook and polling runner, media download and CSV import;
  - a public webhook route outside the authenticated API, verified by secret token;
  - `routes/clients.ts` gains the invite endpoint;
  - the communications endpoints include Telegram.
- **Configuration:** `TELEGRAM_BOT_TOKEN` is now used. New variables are `TELEGRAM_WEBHOOK_SECRET` and `TELEGRAM_MODE` (`webhook` or `polling`). No new npm dependencies: the Bot API is called with `fetch`, and the CSV parser is small and local.
- **Operations:** only one backend can receive a bot's updates. Pointing the webhook at Atlas disconnects any system that uses the same bot today. `docs/OPERATIONS.md` gets the switch-over steps.
- **Web:**
  - a new `TelegramPage` and `TelegramSettingsPage`, with import, bind and reassign dialogs;
  - "Пригласить в Telegram" on `ClientPage`;
  - Telegram entries in "Переписка";
  - the "Telegram" navigation item with an unread badge.
- **Depends on** `add-email-client` (shared client communication history and the reworked integration status) and `add-team-chat` (realtime plumbing).
