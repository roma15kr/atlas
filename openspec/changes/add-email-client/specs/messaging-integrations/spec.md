# Spec Delta

## MODIFIED Requirements

### Requirement: Integration status
The system SHALL report every customer-communication provider with `serverConfigured` derived from its server-side configuration:
- **IMAP/SMTP mail:** configured when the mail encryption key is set.
- **Google mail:** configured when the Google client id, the Google client secret and the mail key are set.
- **Microsoft mail:** configured when the Microsoft client id, the Microsoft client secret and the mail key are set.
- **TELEGRAM:** configured when the bot token is set.
- **WHATSAPP and VIBER:** configured when their credentials are set.

A provider whose configuration is missing SHALL be reported as DISCONNECTED whatever state is stored. The response SHALL also list the caller's own mailboxes with their status and last sync time, and SHALL never include another user's mailboxes.

#### Scenario: Missing credential
- **WHEN** `TELEGRAM_BOT_TOKEN` is not set
- **THEN** Telegram is reported as DISCONNECTED with `serverConfigured: false`

#### Scenario: Mail key missing
- **WHEN** the mail encryption key is not set
- **THEN** all three mail providers report `serverConfigured: false` and the web app shows mail connection as unavailable

## ADDED Requirements

### Requirement: Client communication history
The system SHALL return, for a client and for a deal, the customer conversations linked to it, newest activity first. Each entry SHALL show the channel, the participants, the subject or first line, the last activity time, the message count and the Atlas user whose mailbox or chat it belongs to. The history SHALL be available to every user who can see that client or deal. Opening an entry SHALL show its messages read-only. A request for a client or deal outside the caller's scope SHALL return 404.

#### Scenario: Client card
- **WHEN** a user opens a client with two linked email threads from different colleagues
- **THEN** "Переписка" lists both threads with each colleague's name, and each opens read-only

#### Scenario: Out of scope
- **WHEN** an EMPLOYEE requests the communication history of another employee's client
- **THEN** the response is 404 `CLIENT_NOT_FOUND`

## REMOVED Requirements

### Requirement: Scoped inbox
**Reason**: The inbox had no real channel behind it. It is replaced by each user's mail client and by the Telegram inbox, which have real sync and per-channel privacy.
**Migration**: Use `/api/v1/mail` for mail. Use `GET /api/v1/clients/:id/communications` and `GET /api/v1/deals/:id/communications` for client history. Legacy `messages` rows are dropped after a pre-deploy dump.

### Requirement: Link message to client
**Reason**: Linking moves to whole mail threads, and later Telegram conversations, with automatic matching and deal links.
**Migration**: Use the mail thread link endpoints defined by `email-client`.
