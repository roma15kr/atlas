# presence Specification

## Purpose
Shows who is online in real time through an authenticated Socket.IO connection with heartbeats, scoped by role, and keeps an ONLINE/OFFLINE event history for attendance reporting.

## Requirements

### Requirement: Authenticated presence socket
The system SHALL accept Socket.IO connections only with a valid access token (handshake `auth.token` or Bearer header) for an ACTIVE user, and SHALL reject managers without a department.

#### Scenario: Invalid token
- **WHEN** a socket connects with a missing, expired or invalid token
- **THEN** the connection is refused with `unauthorized`

### Requirement: Online state with expiry
The system SHALL mark a user ONLINE on connect and on each `presence:heartbeat`, with a 300-second expiry stored in Redis (or in process memory when Redis is unavailable), and SHALL mark the user OFFLINE when a socket disconnects. A user with no heartbeat for 300 seconds SHALL be reported as OFFLINE.

#### Scenario: Heartbeat keeps user online
- **WHEN** a connected client emits `presence:heartbeat`
- **THEN** the ONLINE state is refreshed for another 300 seconds and acknowledged to the sender

#### Scenario: Heartbeats stop
- **WHEN** no heartbeat arrives for 300 seconds and no disconnect was received
- **THEN** the user is reported OFFLINE in team, dashboard and snapshot responses

### Requirement: Role-scoped presence broadcast
The system SHALL send `presence:changed` for a user to that user, to all company DIRECTORs, and to MANAGERs of that user's department, and SHALL send each new connection a `presence:snapshot` covering exactly the users visible in its record scope.

#### Scenario: Employee snapshot
- **WHEN** an EMPLOYEE connects
- **THEN** the snapshot contains only that employee

#### Scenario: Director sees company changes
- **WHEN** any user in the company connects or disconnects
- **THEN** every connected DIRECTOR receives `presence:changed`

### Requirement: Presence history
The system SHALL append an `ONLINE` event to `presence_events` on each socket connect and an `OFFLINE` event on each disconnect, including the socket id as session id.

#### Scenario: Connect and disconnect
- **WHEN** a user connects and later disconnects
- **THEN** one ONLINE and one OFFLINE row exist for that session
