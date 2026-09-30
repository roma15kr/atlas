# Proposal

## Why

Managers do most client communication by email, but Atlas can't read or send mail. The "Сообщения" inbox shows Gmail and Outlook as disabled and rejects every external send. As a result, correspondence lives only in personal mail apps: a colleague or head can't see what was promised to a client, and a deal can't be traced back to the email that started it. Each user needs to connect their own mailbox and work with it fully inside Atlas, with threads tied to CRM clients and deals.

## What Changes

- **Mailbox connections.** Each user can connect up to 5 mailboxes:
  - **Google** through OAuth ("Войти через Google");
  - **Microsoft 365 / Outlook** through OAuth;
  - **any other provider** through IMAP (reading) and SMTP (sending), with host, port, security, login and password or app password. A connection test runs before saving.

  Credentials are encrypted at rest and never returned by the API. A mailbox whose login stops working is marked "Требует внимания" and its owner is told.
- **A full mail client on a new "Почта" screen**:
  - every folder of the mailbox, with unread counts;
  - conversations grouped into threads;
  - safe HTML reading, with remote images blocked until allowed;
  - attachments;
  - read/unread, star, move, archive, spam and delete, all synced back to the mail server;
  - compose, reply, reply all and forward, with attachments and a per-mailbox signature;
  - drafts;
  - search across synced mail;
  - new mail arrives live.
- **Sync.** Atlas keeps a synced copy of the last 90 days by default (configurable) and keeps it current in the background. Changes made in other mail apps show up in Atlas, and changes in Atlas reach the server.
- **Privacy.** A mailbox is visible only to its owner, including to directors. Mail becomes visible to others only when a thread is linked to a CRM client or deal. It then appears in that client's or deal's "Переписка", read-only, to everyone who can see that client or deal.
- **CRM linking.**
  - Threads are linked automatically when a correspondent's address matches exactly one client the owner can see.
  - The owner can link, relink or unlink a thread by hand. An unlinked thread is never re-linked automatically.
  - From a thread the owner can create a client, prefilled from the sender, or create a deal in a chosen funnel, linked to that thread.
  - The client card's "Написать" button opens a new message to the client from the user's own mailbox.
- **Client communication history.** The client card, and the deal card, get a "Переписка" section listing linked conversations newest first. `add-telegram-customer-inbox` adds Telegram conversations to the same section.
- **BREAKING (API).**
  - `GET /api/v1/messages`, `POST /api/v1/messages` and `PATCH /api/v1/messages/:id/client` are removed and replaced by `/api/v1/mail` endpoints.
  - The temporary `/inbox` screen from `add-team-chat` is replaced by "Почта".
  - `GET /api/v1/integrations` reports mailbox providers and the caller's mailboxes instead of the GMAIL and OUTLOOK placeholders.
- **BREAKING (data).** The old `messages` table and its enum types are dropped after a pre-deploy dump. It never held real external mail: no adapter existed, and internal sends had no recipient.

## Capabilities

### New Capabilities
- `email-client`: covers
  - mailbox connection through OAuth or IMAP/SMTP;
  - credential protection;
  - sync;
  - folders, threads and message actions;
  - compose, reply and forward, attachments, drafts and signatures;
  - search;
  - live updates;
  - mailbox privacy;
  - CRM linking and creating clients and deals from mail;
  - mail audit events.

### Modified Capabilities
- `messaging-integrations`:
  - "Integration status" now reports mailbox providers (IMAP/SMTP, Google, Microsoft) with their server configuration and the caller's mailboxes.
  - The legacy "Scoped inbox" and "Link message to client" requirements are removed.
  - A new "Client communication history" requirement is added, shared by all customer channels.
- `audit-log`: "external message send, denial and linking" becomes the mail-specific events defined in `email-client`.

## Impact

- **Database:**
  - migration `007_email_client.sql` adds `mail_accounts`, `mail_folders`, `mail_threads`, `mail_messages`, `mail_attachments` and `mail_drafts`, with full-text search on messages;
  - it drops `messages` and the `message_channel`, `message_direction` and `message_delivery_status` types;
  - a demo-only `007_email_client_seed.sql`.
- **API:**
  - a new `routes/mail.ts`, plus `mail/` modules for crypto, IMAP sync, SMTP send, OAuth, threading and HTML sanitizing;
  - a background sync scheduler in the API process, guarded by a Postgres advisory lock;
  - `routes/clients.ts` and `routes/deals.ts` gain `/communications`;
  - `routes/integrations.ts` is reworked;
  - `routes/messages.ts` is removed.
- **New dependencies:** `imapflow`, `nodemailer`, `mailparser`, `sanitize-html`.
- **Configuration:**
  - new variables `MAIL_ENCRYPTION_KEY` (required to connect a mailbox), `MAIL_SYNC_DAYS`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` and `MAIL_ALLOW_PRIVATE_HOSTS`;
  - the existing `GOOGLE_CLIENT_ID` and `MICROSOFT_CLIENT_ID` are now used.
- **Operations:** the Google and Microsoft app registrations are documented in `docs/OPERATIONS.md`, along with a new backup rule for the mail attachment cache on the documents volume.
- **Web:**
  - new `MailPage` and `MailSettingsPage`, with compose, connect and link dialogs;
  - a "Переписка" section on `ClientPage` and on the deal view;
  - the "Почта" navigation item with an unread badge;
  - `InboxPage` is removed;
  - `AppContext`, types and demo data are updated.
- **Depends on** `add-team-chat` (realtime plumbing and navigation) and `add-multiple-crm-funnels` (deal creation in a funnel).
