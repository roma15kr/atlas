# Spec Delta

## MODIFIED Requirements

### Requirement: Online state with expiry
The system SHALL track each user's open connections. A user SHALL be ONLINE while at least one connection is open and the user was active within the last 5 minutes.
- A connection counts the user as active when it connects, and on each `presence:heartbeat` that reports `active: true`. A missing `active` value is treated as true.
- A heartbeat with `active: false` SHALL make the user OFFLINE.
- Closing a connection SHALL make the user OFFLINE only when no other live connection remains.
- The active state SHALL expire after 300 seconds without an active heartbeat.
- State SHALL be kept in Redis, or in process memory when Redis is unavailable.

#### Scenario: Heartbeat keeps user online
- **WHEN** a connected client emits `presence:heartbeat` with `active: true`
- **THEN** the ONLINE state is refreshed for another 300 seconds and acknowledged to the sender

#### Scenario: Heartbeats stop
- **WHEN** no active heartbeat arrives for 300 seconds and no disconnect was received
- **THEN** the user is reported OFFLINE in team, dashboard and snapshot responses

#### Scenario: Second tab closed
- **WHEN** a user has two tabs open and closes one of them
- **THEN** the user stays ONLINE and no `presence:changed` event is sent

#### Scenario: Idle for five minutes
- **WHEN** the user's browser reports `active: false` after 5 minutes without keyboard, mouse, scroll or touch activity in any Atlas tab
- **THEN** the user becomes OFFLINE and their managers receive `presence:changed`

### Requirement: Presence history
The system SHALL append a `presence_events` row only when a user's state changes, with the socket id as session id:
- `ONLINE` when the user becomes ONLINE;
- `OFFLINE` when the user becomes OFFLINE through idleness or by closing the last connection;
- `TIMEOUT`, at the time last seen, when an expired state is noticed.

Rows SHALL be written only for users who have accepted the current monitoring policy version.

#### Scenario: Connect and disconnect
- **WHEN** a consenting user connects and later closes their only connection
- **THEN** one ONLINE and one OFFLINE row exist for that session

#### Scenario: User without consent
- **WHEN** a user who has not accepted the monitoring policy connects and disconnects
- **THEN** their live status is broadcast but no `presence_events` row is written

## ADDED Requirements

### Requirement: Transition-only broadcast
The system SHALL send `presence:changed` only when a user's state changes between ONLINE and OFFLINE, not for every connection or heartbeat.

#### Scenario: Repeated heartbeats
- **WHEN** an ONLINE user sends ten active heartbeats
- **THEN** no `presence:changed` event is sent for them
