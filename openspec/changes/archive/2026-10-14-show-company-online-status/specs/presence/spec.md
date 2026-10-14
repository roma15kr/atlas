## ADDED Requirements

### Requirement: Company-wide online signal
The system SHALL let every user of a company see whether each active colleague is online now, without times. On every ONLINE/OFFLINE transition it SHALL send `presence:online { userId, online }` to all of the company's connections, alongside the scoped `presence:changed`. Last-seen times and presence history SHALL stay within the existing role scope.

#### Scenario: Employee sees another department come online
- **WHEN** a user of «Отдел продаж» connects while an employee of «Маркетинг» is connected
- **THEN** the employee receives `presence:online` with `online: true` for that user, and no `lastSeenAt`

#### Scenario: Times stay scoped
- **WHEN** the same user disconnects
- **THEN** the employee receives `presence:online` with `online: false`, and only the user's head, the directors and the user receive `presence:changed` with `lastSeenAt`
