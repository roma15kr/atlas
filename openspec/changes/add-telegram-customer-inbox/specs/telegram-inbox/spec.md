# Spec Delta

## Purpose

Receive and answer customers' Telegram messages sent to the company bot inside Atlas. Each conversation is routed to the customer's responsible manager and kept with the CRM client.

## ADDED Requirements

### Requirement: Bot connection
The system SHALL connect to the company bot using the server-side bot token. It SHALL receive updates:
- through a webhook at a public Atlas URL, which the system registers itself; or
- through long polling when the server is configured for polling mode.

Webhook requests SHALL be accepted only when they carry the configured secret token, and SHALL otherwise be rejected with 401 without processing. Each update SHALL be processed at most once. Updates from group chats, channels and other bots SHALL be ignored.

A DIRECTOR SHALL be able to see:
- the bot's username;
- whether the connection works;
- the time of the last received update;
- the last delivery error reported by Telegram.

Without a bot token, the Telegram screens SHALL show the channel as not configured, and no Telegram endpoint SHALL send anything.

#### Scenario: Forged webhook call
- **WHEN** a request reaches the webhook without the correct secret token header
- **THEN** it is rejected with 401 and no message is stored

#### Scenario: Duplicate delivery
- **WHEN** Telegram delivers the same update twice
- **THEN** the message is stored once

### Requirement: Telegram contacts
The system SHALL keep one contact per Telegram user who writes to the bot in a private chat. A contact SHALL record:
- the Telegram user id, username, first and last name;
- an optional linked CRM client of the company;
- an optional responsible user;
- a status: `ACTIVE`, `BLOCKED` (the customer blocked the bot) or `UNVERIFIED` (imported, but the customer has not written to the bot since).

Names and usernames SHALL update from each incoming message. A client MAY have several Telegram contacts. A Telegram contact SHALL belong to at most one client.

#### Scenario: Customer changes their name
- **WHEN** a bound customer writes after changing their Telegram name
- **THEN** the contact shows the new name and keeps its client and responsible user

### Requirement: Importing existing contacts
A DIRECTOR or MANAGER SHALL be able to import contacts from a CSV file of up to 5000 rows. The columns are:
- `telegram_id`: required, the numeric Telegram user id as known to this bot;
- one of `client_id`, `client_email` or `client_phone`: optional;
- `responsible`: optional username; defaults to the client's owner;
- `name`: optional.

The system SHALL first return a preview that classifies each row as new, update, unchanged or error, with a Russian reason for each error:
- invalid id;
- client not found or not visible;
- responsible user not found or outside scope;
- Telegram id already bound to a different client;
- duplicate row.

Only after confirmation SHALL it apply the valid rows. A MANAGER SHALL only import rows whose client and responsible user are in their department. An EMPLOYEE SHALL receive 403 `TELEGRAM_FORBIDDEN`, audited as `TELEGRAM_CONTACTS_IMPORT_DENIED`. Imported contacts that have not written to the bot since the import SHALL be `UNVERIFIED` until their first message.

#### Scenario: Import preview
- **WHEN** a director uploads a CSV with 100 valid rows and 3 rows whose client email matches no client
- **THEN** the preview shows 100 rows to import and 3 errors reading "Клиент не найден", and nothing is saved yet

#### Scenario: Head imports another department's client
- **WHEN** a MANAGER's CSV references a client of another department
- **THEN** that row is an error "Клиент вне вашего отдела" and is not applied

### Requirement: Invite links
A user who can see a client SHALL be able to create a personal invite link for it: `https://t.me/<bot username>?start=<token>`. The token is random, single-use and valid for 30 days. When a customer starts the bot through the link, the system SHALL bind their contact to that client, with the link's creator as responsible user (or the client's owner when the creator is outside that client's department), and SHALL send the configured welcome text.
- A token that is expired, already used or unknown SHALL be treated as a start without a token.
- When the Telegram user is already bound to a different client, the system SHALL keep the existing binding and SHALL mark the invite as conflicting for its creator.

#### Scenario: Customer opens the invite
- **WHEN** a customer opens a client's invite link and presses "Start"
- **THEN** a contact bound to that client appears in the responsible manager's "Мои" list with the start event

#### Scenario: Reused link
- **WHEN** a second Telegram user opens an already used invite link
- **THEN** that user is treated as an unknown sender and the first binding is unchanged

### Requirement: Unknown senders and triage
A message from a Telegram user with no client and no responsible user SHALL:
- create or update the contact;
- place it in the "Неразобранные" queue, visible to DIRECTORs and all MANAGERs;
- send the configured greeting once.

When the director has set a default responsible user, the new contact SHALL be assigned to that user instead of the queue. From the queue, a DIRECTOR SHALL be able to bind a contact to any client and responsible user, and a MANAGER to clients and users of their own department. A user SHALL also be able to create a new client from the contact, prefilled with the Telegram name.

#### Scenario: New customer writes
- **WHEN** a Telegram user who is not in Atlas writes "Здравствуйте, сколько стоит доставка?"
- **THEN** the contact appears in "Неразобранные" with that message, and the greeting is sent once

### Requirement: Conversation access and routing
A contact's conversation SHALL be visible to, and answerable by:
- its responsible user;
- MANAGERs of the responsible user's department;
- all DIRECTORs of the company.

An unassigned contact SHALL be visible to DIRECTORs and MANAGERs only. Other users SHALL receive 404 `TELEGRAM_CONTACT_NOT_FOUND`.
- A DIRECTOR SHALL be able to change the responsible user to any ACTIVE user.
- A MANAGER SHALL be able to change it only between users of their own department.
- When the responsible user is disabled, their contacts SHALL return to the "Неразобранные" queue.

#### Scenario: Employee sees only their customers
- **WHEN** an EMPLOYEE lists Telegram conversations
- **THEN** only contacts for which they are responsible are returned

#### Scenario: Head covers for an absent manager
- **WHEN** a MANAGER opens a conversation of an employee in their department and replies
- **THEN** the customer receives the reply from the bot, and Atlas shows it as sent by that manager

### Requirement: Receiving messages
The system SHALL store every incoming private-chat message:
- text and captions;
- photos, documents, voice notes, audio, video and video notes up to Telegram's bot download limit, as downloadable attachments;
- stickers, locations and shared contacts as readable summaries.

A customer's edit of a message SHALL update the stored text and mark it edited. A file that exceeds the download limit SHALL be shown as "Файл слишком большой для загрузки ботом" with its name and size. New messages SHALL reach the users who can see the conversation live.

#### Scenario: Customer sends a photo
- **WHEN** a bound customer sends a photo with a caption
- **THEN** the responsible manager sees the photo and caption in the conversation without reloading

### Requirement: Replying to customers
A user who can see a conversation SHALL be able to send text of 1–4096 characters, optionally with one photo or document within the server upload limit, and optionally as a reply to a specific customer message. The message SHALL be sent through the company bot and stored with the sending user and a status of SENDING, then SENT or FAILED.
- When Telegram reports that the customer blocked the bot, the system SHALL mark the contact `BLOCKED` and show "Клиент заблокировал бота".
- Sending to a `BLOCKED` contact SHALL be refused with 409 `TELEGRAM_CONTACT_BLOCKED`.
- When the customer unblocks the bot or writes again, the contact SHALL return to `ACTIVE`.
- Sending to an `UNVERIFIED` contact SHALL be attempted. If Telegram rejects it because the chat is unknown, the result SHALL be 409 `TELEGRAM_CONTACT_UNREACHABLE`, and the user SHALL be offered an invite link to send by other means.

#### Scenario: Reply
- **WHEN** a manager replies "Доставка 150 грн" to a customer
- **THEN** the customer receives the text from the company bot, and Atlas stores it as SENT by that manager

#### Scenario: Customer blocked the bot
- **WHEN** a manager sends to a customer who has blocked the bot
- **THEN** the message is FAILED, the contact becomes BLOCKED, and later sends return 409 `TELEGRAM_CONTACT_BLOCKED`

### Requirement: Read state and unread counts
The system SHALL keep read positions per user and conversation. It SHALL list conversations by last activity, each with its unread count for the caller, and SHALL offer the filters "Мои", "Неразобранные" (DIRECTORs and MANAGERs) and "Все". The "Telegram" navigation badge SHALL show unread customer messages in conversations where the caller is responsible, plus, for DIRECTORs and MANAGERs, unread messages in the unassigned queue.

#### Scenario: Opening a conversation
- **WHEN** the responsible manager opens a conversation with 4 unread messages
- **THEN** its unread count and the navigation badge drop by 4

### Requirement: CRM links for Telegram conversations
Every Telegram message of a contact linked to a client, incoming and outgoing, SHALL be recorded in that client's CRM communication history ("Переписка" on the client card). Each entry SHALL show:
- the direction;
- the time;
- the text or attachment summary;
- for replies, the Atlas user who sent them.

The history SHALL include:
- messages exchanged before the link was made, from the start of the conversation;
- new messages, as they arrive or are sent;
- for a conversation linked to a deal, the same messages in that deal's history.

When a contact is relinked to another client, its whole conversation SHALL move to the new client's history. Everyone who can see the client or deal SHALL be able to read this history, read-only, even without access to the conversation in the Telegram screen.

The system SHALL let a user who can see the conversation:
- link or relink it to a client they can see;
- create a client from it;
- create a deal from it in a funnel they can use, which links the conversation to the deal.

All of these follow the normal client and deal rules.

#### Scenario: Conversation recorded in client history
- **WHEN** a customer bound to a client writes in Telegram and the responsible manager replies
- **THEN** both messages appear in the client's "Переписка" with their times, and the reply shows the manager's name

#### Scenario: Earlier messages after linking
- **WHEN** an unknown sender who wrote five messages is bound to a client from the "Неразобранные" queue
- **THEN** all five messages and every later message appear in that client's history

#### Scenario: Deal from Telegram
- **WHEN** a manager chooses "Создать сделку" in a conversation linked to a client and picks a funnel
- **THEN** a deal for that client is created in the funnel's first stage, and the conversation appears in the deal's "Переписка"

### Requirement: Bot texts and defaults
A DIRECTOR SHALL be able to edit these texts, each up to 1000 characters:
- the greeting sent to unknown senders;
- the welcome text sent after an invite link binds a contact.

The DIRECTOR SHALL also be able to set or clear the default responsible user for unknown senders.

#### Scenario: Custom greeting
- **WHEN** the director changes the greeting and a new unknown customer writes
- **THEN** that customer receives the new greeting

### Requirement: Telegram audit events
The system SHALL audit the following:

| Event | Metadata |
| --- | --- |
| `TELEGRAM_CONTACTS_IMPORTED` | counts of rows applied and rejected |
| `TELEGRAM_CONTACT_BOUND` | contact and client ids; source: invite, triage or import |
| `TELEGRAM_CONTACT_REASSIGNED` | previous and new responsible ids |
| `TELEGRAM_INVITE_CREATED` | client id |
| `TELEGRAM_MESSAGE_SENT` | contact and client ids |
| `TELEGRAM_SETTINGS_UPDATED` | — |
| `_DENIED` variants of the above | — |

Message text, Telegram names, usernames and phone numbers SHALL NOT be written to the audit log.

#### Scenario: Audited reassignment
- **WHEN** a head reassigns a conversation to another employee of their department
- **THEN** `TELEGRAM_CONTACT_REASSIGNED` is written with both user ids and no message text
