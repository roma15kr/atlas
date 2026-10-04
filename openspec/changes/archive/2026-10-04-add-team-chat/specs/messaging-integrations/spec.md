# Spec Delta

## MODIFIED Requirements

### Requirement: Scoped inbox
The system SHALL list external-channel messages newest first within the caller's record scope (by message owner), filterable by channel and client, with a 180-character preview and linked client summary. Messages stored on the `INTERNAL` channel before team chat existed SHALL remain listed as history, and no new ones SHALL be created.

#### Scenario: Employee inbox
- **WHEN** an EMPLOYEE lists messages
- **THEN** only messages owned by that employee are returned

## REMOVED Requirements

### Requirement: Internal sending only
**Reason**: Internal communication moves to team chat, which has real recipients, membership and delivery. The old endpoint stored a message addressed to free text that nobody received.
**Migration**: Use the `/api/v1/chat` direct message, group and channel endpoints. `POST /api/v1/messages` returns 501 `CHANNEL_ADAPTER_UNAVAILABLE` for every channel, including `INTERNAL`, and audits `MESSAGE_SEND_DENIED` until the email and Telegram adapters ship.
