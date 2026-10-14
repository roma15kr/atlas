## MODIFIED Requirements

### Requirement: Online state with expiry
The system SHALL track each user's open connections. A user SHALL be ONLINE while at least one connection is open and the user was active within the idle period: `PRESENCE_IDLE_MINUTES`, 5 to 120 minutes, 15 by default.
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

#### Scenario: Short pause
- **WHEN** the user has had no keyboard, mouse, scroll or touch activity in any Atlas tab for 10 minutes, with the default period
- **THEN** the user stays ONLINE

#### Scenario: Idle for five minutes
- **WHEN** the server runs with `PRESENCE_IDLE_MINUTES=5` and the user's browser reports `active: false` after 5 minutes without activity in any Atlas tab
- **THEN** the user becomes OFFLINE and their managers receive `presence:changed`

#### Scenario: Idle for the whole period
- **WHEN** the user's browser reports `active: false` after 15 minutes without activity in any Atlas tab, with the default period
- **THEN** the user becomes OFFLINE and their managers receive `presence:changed`

### Requirement: Live presence in the UI
The web app SHALL open an authenticated Socket.IO connection and apply `presence:snapshot` and `presence:changed` events to the team list.
- It SHALL track keyboard, mouse, scroll and touch activity, shared across the user's tabs.
- It SHALL send `presence:heartbeat` with `active`, meaning activity within the idle period, every 60 seconds.
- It SHALL take the idle period from the `presence:config { idleMinutes }` event the server sends on connect, and use 15 minutes until it arrives.
- It SHALL also send a heartbeat immediately when the user becomes idle or active again.

#### Scenario: Colleague comes online
- **WHEN** a `presence:changed` event marks a visible colleague ONLINE
- **THEN** their indicator turns green without reloading

#### Scenario: Activity in another tab
- **WHEN** the user works in one Atlas tab while another Atlas tab is in the background
- **THEN** both tabs report `active: true`

#### Scenario: Server sets a shorter period
- **WHEN** the server runs with `PRESENCE_IDLE_MINUTES=10` and a user stops working
- **THEN** their browser reports `active: false` after 10 minutes
