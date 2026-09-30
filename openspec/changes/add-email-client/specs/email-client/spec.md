# Spec Delta

## Purpose

A full email client inside Atlas for each user's own mailboxes, connected through Google or Microsoft OAuth or through IMAP/SMTP. It keeps mail private to its owner, and links threads to CRM clients and deals so client correspondence becomes shared work history.

## ADDED Requirements

### Requirement: Mailbox connection
The system SHALL let every authenticated user connect up to 5 mailboxes of their own, in three ways:
- **Google**, through the OAuth authorization-code flow. Available only when the Google client id and secret are configured on the server.
- **Microsoft 365 / Outlook**, through the OAuth authorization-code flow. Available only when the Microsoft client id and secret are configured on the server.
- **IMAP/SMTP**, with an IMAP host, port and security (SSL/TLS or STARTTLS), an SMTP host, port and security, a login, and a password or app password.

Before saving an IMAP/SMTP mailbox, the system SHALL log in to both servers. When that fails, it SHALL reject the mailbox with 400 `MAIL_CONNECTION_FAILED` and a Russian reason: authentication, host unreachable, or TLS error. The same email address SHALL NOT be connected twice by the same user. OAuth callbacks SHALL be accepted only with a valid, unexpired state bound to the user who started them.

#### Scenario: Connecting a company mailbox by IMAP
- **WHEN** a user submits correct IMAP and SMTP settings for their mailbox
- **THEN** the mailbox is saved as CONNECTED, its folders appear, and the first sync starts

#### Scenario: Wrong password
- **WHEN** the IMAP login is rejected by the server
- **THEN** the response is 400 `MAIL_CONNECTION_FAILED` with the reason "Неверный логин или пароль" and nothing is saved

#### Scenario: Google not configured
- **WHEN** the server has no Google client secret
- **THEN** the "Google" option is shown as unavailable and starting its OAuth flow returns 501 `MAIL_PROVIDER_UNAVAILABLE`

### Requirement: Credential protection
The system SHALL encrypt mailbox passwords and OAuth refresh tokens at rest with the server's mail encryption key, and SHALL refuse to connect any mailbox with 503 `MAIL_ENCRYPTION_UNCONFIGURED` when no key is configured. Credentials SHALL NOT be returned by any endpoint, written to logs or written to the audit log.
- Unless the server explicitly allows private hosts, IMAP and SMTP hosts SHALL resolve to public addresses.
- Only the standard mail ports (IMAP 993/143, SMTP 465/587/25) SHALL be accepted.
- Server TLS certificates SHALL be verified.

#### Scenario: Reading a mailbox
- **WHEN** the owner fetches their mailbox settings
- **THEN** host, port, security, login and status are returned, and the password field is absent

#### Scenario: Private network host
- **WHEN** a user enters an IMAP host that resolves to 10.0.0.5 and private hosts are not allowed
- **THEN** the response is 400 `MAIL_HOST_NOT_ALLOWED`

### Requirement: Mailbox privacy
A mailbox, its folders, threads, messages, attachments and drafts SHALL be accessible only to the user who connected it, whatever their role. The one exception SHALL be threads linked to a CRM client or deal: their messages SHALL be readable, not actionable, through that client's or deal's communication history by users who can see that client or deal. Requests for another user's mailbox data SHALL return 404.

#### Scenario: Director opens an employee's mail
- **WHEN** a DIRECTOR requests a thread from an employee's mailbox that is not linked to any client or deal
- **THEN** the response is 404 `MAIL_NOT_FOUND`

#### Scenario: Head reads linked correspondence
- **WHEN** a MANAGER opens a client in their department whose thread an employee linked
- **THEN** the manager can read that thread's messages in the client's "Переписка" but cannot reply, move or delete them

### Requirement: Mailbox sync
The system SHALL keep a synced copy of each connected mailbox:
- **Scope:** every folder's messages received within the configured window, 90 days by default. Older messages SHALL NOT be fetched in bulk.
- **Frequency:** new mail in the inbox SHALL appear within 2 minutes, and changes in other folders within 10 minutes. A manual refresh SHALL sync the mailbox at once.
- **Other clients:** read, flag, move and delete changes made in other mail clients SHALL be reflected.
- **Failures:** an authentication failure, including a revoked OAuth grant, SHALL set the mailbox to NEEDS_ATTENTION with a Russian reason and stop syncing it until the owner reconnects. Transient network errors SHALL be retried with back-off without changing the status.

#### Scenario: Mail arrives
- **WHEN** a client emails the user's connected inbox
- **THEN** the message appears in "Входящие" within 2 minutes, and the owner's open Atlas tab shows it live

#### Scenario: Revoked access
- **WHEN** the user revokes Atlas's access in their Google account
- **THEN** the mailbox shows "Требует внимания" with a reconnect action, and sync stops

### Requirement: Folders and threads
The system SHALL list each mailbox's folders with total and unread counts. Standard folders SHALL be shown under Russian names first: Входящие, Отправленные, Черновики, Архив, Спам, Корзина. User folders follow.

Messages SHALL be grouped into threads:
- by the provider's thread id when available;
- otherwise by `In-Reply-To` and `References`;
- otherwise by the normalized subject shared with a correspondent within 30 days.

A folder view SHALL list threads newest first, 50 per page. Each entry SHALL show the correspondents, subject, snippet, message count, unread state, star, attachment marker and the linked client.

#### Scenario: Reply lands in the same thread
- **WHEN** a client answers a message the user sent from Atlas
- **THEN** the answer appears in the same thread as the original message

### Requirement: Reading messages
The system SHALL return a thread's messages oldest first with:
- sender;
- To, Cc and, for the user's own sent mail, Bcc recipients;
- date;
- plain-text body, and an HTML body sanitized on the server;
- attachments (name, type, size).

Remote images in HTML SHALL be blocked until the owner chooses "Показать изображения" for that message. HTML SHALL be displayed isolated from the Atlas page, so scripts and forms in mail never run. Opening a thread SHALL mark its messages read on the server. Attachments SHALL download with their original name and as a download, never rendered inline as HTML.

#### Scenario: Tracking pixel
- **WHEN** the owner opens a newsletter containing remote images
- **THEN** no remote request is made until they press "Показать изображения"

#### Scenario: Script in mail
- **WHEN** an HTML message contains a `<script>` element or an `onclick` attribute
- **THEN** the displayed message contains neither

### Requirement: Message actions
The owner SHALL be able to apply these actions to one or several threads or messages, each carried out on the mail server:
- mark read or unread;
- star or unstar;
- move to a folder;
- archive;
- mark as spam;
- delete.

Delete SHALL move to Корзина; deleting from Корзина SHALL remove permanently after confirmation. When the server rejects an action, the local state SHALL be restored and the user SHALL see a Russian error.

#### Scenario: Archiving a thread
- **WHEN** the owner archives a thread
- **THEN** its messages move to the mailbox's archive folder on the server and leave "Входящие" in Atlas

### Requirement: Composing and sending
The owner SHALL be able to write a new message, reply, reply all or forward from any of their CONNECTED mailboxes:
- To, Cc and Bcc, with address suggestions from CRM clients they can see and from past correspondents;
- a subject;
- a body with basic formatting (bold, italic, lists, links);
- the mailbox signature;
- attachments within the server upload limit. Forwarding keeps the original attachments.

Replies SHALL carry correct `In-Reply-To` and `References` headers and SHALL join the original thread. Sent messages SHALL appear in Отправленные, saved on the server when the provider doesn't save them itself. A send that the SMTP server rejects SHALL be reported with a Russian reason and SHALL keep the draft. Sending SHALL be limited to 100 messages per user per hour, with 429 `MAIL_RATE_LIMITED` beyond that.

#### Scenario: Replying to a client
- **WHEN** the owner replies to a client's message with an attachment
- **THEN** the client receives the reply with the attachment in the same conversation, and it appears in the thread and in Отправленные

#### Scenario: Sending from a mailbox that needs attention
- **WHEN** the owner sends from a mailbox in NEEDS_ATTENTION
- **THEN** the response is 409 `MAIL_ACCOUNT_UNAVAILABLE` and the draft is kept

### Requirement: Drafts and signatures
The system SHALL save the message being composed as a draft automatically at least every 5 seconds while it changes. Drafts SHALL be listed in "Черновики" and SHALL be deletable. Drafts that exist only on the mail server SHALL be listed there, and opening one SHALL let the owner continue it in Atlas. Each mailbox SHALL have an optional signature of up to 2000 characters that is added to new messages, replies and forwards.

#### Scenario: Closing the composer
- **WHEN** the owner closes the composer without sending
- **THEN** the message is kept in "Черновики" and can be reopened and sent later

### Requirement: Mail search
The system SHALL let the owner search their synced mail by words in the subject, body, sender or recipients, optionally limited to one mailbox or folder, with results ranked newest first.

#### Scenario: Finding a quote
- **WHEN** the owner searches "коммерческое предложение"
- **THEN** threads whose synced messages contain those words are listed, including from Отправленные

### Requirement: CRM linking
A thread SHALL have at most one linked client and at most one linked deal.
- **Automatic linking:** when a thread is synced or sent and has no link, the system SHALL link it to a client when the email address of a correspondent other than the owner matches, case-insensitively, the email of exactly one client the owner can see. When several clients match, it SHALL suggest them instead of linking.
- **Manual linking:** the owner SHALL be able to link a thread to a client they can see, link it to a deal they can see (which also links the deal's client), change the link, or remove it.
- A thread unlinked by the owner SHALL never be linked automatically again.
- A link to a client or deal outside the owner's scope SHALL return 404 `CLIENT_NOT_FOUND` or `DEAL_NOT_FOUND`.

#### Scenario: Automatic link
- **WHEN** mail arrives from anna@example.com and the owner can see exactly one client with that email
- **THEN** the thread is linked to that client and appears in the client's "Переписка"

#### Scenario: Owner keeps a thread private
- **WHEN** the owner removes the automatic link from a thread
- **THEN** the thread leaves the client's history and later messages in it don't relink it

### Requirement: Creating clients and deals from mail
From a thread, the owner SHALL be able to:
- create a client prefilled with the correspondent's name and email, subject to the normal client-creation rules;
- create a deal in a funnel they can use, prefilled with the linked client and the thread subject as title, subject to the normal deal-creation rules.

Either action SHALL link the thread to the new record.

#### Scenario: Deal from an inquiry
- **WHEN** the owner chooses "Создать сделку" on an inquiry thread linked to a client and picks a funnel
- **THEN** a deal is created in that funnel's first stage for that client, and the thread shows as linked to it on the deal

### Requirement: Mail counts and live updates
The system SHALL report the owner's total unread count across the inbox folders of their mailboxes for the "Почта" navigation badge. It SHALL push new-mail, status and mailbox-status changes to the owner's open sessions only.

#### Scenario: Badge
- **WHEN** three unread messages arrive across two of the user's mailboxes
- **THEN** the "Почта" badge shows 3 without reloading the page

### Requirement: Disconnecting a mailbox
The owner SHALL be able to disconnect a mailbox after confirming. The system SHALL:
- delete its stored credentials and every synced message, attachment and draft, except the messages of threads linked to a client or deal, which stay as read-only client history;
- revoke the OAuth grant where the provider supports it.

#### Scenario: Linked history survives
- **WHEN** the owner disconnects a mailbox that had a thread linked to a client
- **THEN** the mailbox disappears from "Почта", and the linked thread remains readable in the client's "Переписка"

### Requirement: Mail audit events
The system SHALL audit the following, and SHALL never write message bodies, subjects, addresses or credentials to the audit log:

| Event | Metadata |
| --- | --- |
| `MAIL_ACCOUNT_CONNECTED` | provider |
| `MAIL_ACCOUNT_DISCONNECTED` | provider |
| `MAIL_ACCOUNT_CONNECT_FAILED` | provider and reason category |
| `MAIL_SENT` | mailbox id, recipient count, linked client and deal ids |
| `MAIL_SEND_FAILED` | mailbox id, recipient count, linked client and deal ids |
| `MAIL_THREAD_LINKED` | client and deal ids, automatic or manual |
| `MAIL_THREAD_UNLINKED` | client and deal ids, automatic or manual |
| denied access to linked history | — |

#### Scenario: Audited send
- **WHEN** the owner sends a message linked to a client
- **THEN** `MAIL_SENT` is written with the client id and recipient count and without the subject or addresses
