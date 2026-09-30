# messaging-integrations Specification

## Purpose
Provides one scoped message inbox with links to CRM clients, internal sending, and truthful status for external channels (Gmail, Outlook, Telegram, WhatsApp, Viber) that stay disabled until server-side credentials exist.

## Requirements

### Requirement: Integration status
The system SHALL report every provider (GMAIL, OUTLOOK, TELEGRAM, WHATSAPP, VIBER) with `serverConfigured` derived from its server-side credential, and SHALL report DISCONNECTED for any provider whose credential is missing, regardless of stored state. Company-wide and the caller's own connections SHALL be shown.

#### Scenario: Missing credential
- **WHEN** `TELEGRAM_BOT_TOKEN` is not set
- **THEN** Telegram is reported as DISCONNECTED with `serverConfigured: false`

### Requirement: Scoped inbox
The system SHALL list messages newest first within the caller's record scope (by message owner), filterable by channel and client, with a 180-character preview and linked client summary.

#### Scenario: Employee inbox
- **WHEN** an EMPLOYEE lists messages
- **THEN** only messages owned by that employee are returned

### Requirement: Internal sending only
The system SHALL store and mark SENT an outbound INTERNAL message, optionally linked to a visible client, and SHALL reject sending on any external channel with 501 `CHANNEL_ADAPTER_UNAVAILABLE`, auditing `MESSAGE_SEND_DENIED`.

#### Scenario: Send via WhatsApp
- **WHEN** a user posts a message with `channel: WHATSAPP`
- **THEN** the response is 501 and nothing is stored

#### Scenario: Send internal message
- **WHEN** a user posts an INTERNAL message
- **THEN** the message is stored as OUTBOUND/SENT and `MESSAGE_SENT` is audited

### Requirement: Link message to client
The system SHALL let a user link or unlink an in-scope message to a client they can see, auditing `MESSAGE_LINKED`.

#### Scenario: Link to invisible client
- **WHEN** the target client is outside the caller's scope
- **THEN** the response is 404 `CLIENT_NOT_FOUND`
