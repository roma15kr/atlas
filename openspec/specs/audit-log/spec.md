# audit-log Specification

## Purpose
Keeps an append-only record of sensitive actions, both successful and denied, with actor, IP and user agent, readable by directors and by managers for their department.

## Requirements

### Requirement: Append-only audit events
The system SHALL write audit events with company, department, actor, action, entity type and id, client IP (IPv4-mapped addresses normalized), user agent (max 500 characters) and JSON metadata, and the database SHALL reject any UPDATE or DELETE on `audit_logs`.

#### Scenario: Tampering attempt
- **WHEN** any process runs UPDATE or DELETE on an audit row
- **THEN** the database raises `audit_logs is append-only`

### Requirement: Audited actions
The system SHALL audit at least:
- login success and denial;
- team member creation;
- consent changes;
- client list, view, create, update, delete, comment and export success or denial;
- deal changes;
- funnel creation, update and deletion, and funnel access changes;
- stage creation, update, reordering and deletion (with the number of relocated deals);
- denied funnel configuration attempts;
- task changes;
- document upload, new version and download;
- report creation;
- alert acknowledgement;
- AI analysis requests;
- external message send, denial and linking;
- chat channel creation, settings changes, archiving, membership and admin changes, and denied attempts: `CHAT_CHANNEL_CREATED`, `CHAT_CHANNEL_UPDATED`, `CHAT_CHANNEL_ARCHIVED`, `CHAT_MEMBER_ADDED`, `CHAT_MEMBER_REMOVED`, `CHAT_ADMIN_CHANGED`, and their `_DENIED` variants;
- deletion of another person's chat message (`CHAT_MESSAGE_MODERATED`).

Chat message text SHALL NOT be written to the audit log. Ordinary chat messages, edits, reads and a user's own deletions SHALL NOT be audited.

#### Scenario: Denied action
- **WHEN** a denied export or login occurs
- **THEN** an event whose action ends in `DENIED` is written

#### Scenario: Denied funnel configuration
- **WHEN** a non-director tries to change a funnel or stage
- **THEN** a `FUNNEL_CONFIG_DENIED` event with the attempted operation is written

#### Scenario: Access change trail
- **WHEN** a DIRECTOR changes a funnel's access
- **THEN** a `FUNNEL_ACCESS_UPDATED` event records the previous and new mode, departments and users

#### Scenario: Moderator deletes a message
- **WHEN** a channel admin deletes a colleague's message
- **THEN** `CHAT_MESSAGE_MODERATED` is written with the conversation and message ids and without the message text

### Requirement: Audit viewer
The system SHALL let a DIRECTOR read all company audit events and a MANAGER read events of their department, newest first, filterable by action and entity type, each marked DENIED or SUCCESS by action suffix. EMPLOYEEs SHALL be refused.

#### Scenario: Employee opens audit
- **WHEN** an EMPLOYEE calls `GET /api/v1/audit`
- **THEN** the response is 403 `FORBIDDEN`

### Requirement: Task board configuration audit
The system SHALL audit:
- `TASK_BOARD_CREATED`, `TASK_BOARD_UPDATED` and `TASK_BOARD_DELETED`
- `TASK_BOARD_MEMBERS_UPDATED`, with the previous and new members
- `TASK_STAGE_CREATED`, `TASK_STAGE_UPDATED` and `TASK_STAGES_REORDERED`
- `TASK_STAGE_DELETED`, with the target stage and the number of moved tasks
- `TASK_BOARD_CONFIG_DENIED`, with the attempted operation

Each event SHALL carry the board's department, so a department head sees their own boards' events in the audit screen.

#### Scenario: Denied board configuration
- **WHEN** an employee tries to add a stage to a board
- **THEN** a `TASK_BOARD_CONFIG_DENIED` event with operation `STAGE_CREATE` and the board's department is written

### Requirement: Profile change auditing
The system SHALL audit a user's own profile change as `PROFILE_UPDATED` with the names of the changed fields and without their values.

#### Scenario: Specialty changed
- **WHEN** a user changes their specialty
- **THEN** a `PROFILE_UPDATED` event with `fields: ["specialty"]` is written

### Requirement: Account administration auditing
The system SHALL audit:
- `TEAM_MEMBER_UPDATED`, with the changed field names, and old and new role and department;
- `TEAM_MEMBER_DISABLED` and `TEAM_MEMBER_ENABLED`;
- `PASSWORD_RESET` and `PASSWORD_CHANGED`;
- `PASSWORD_CHANGE_DENIED`;
- `TEAM_MEMBER_ADMIN_DENIED`, with the attempted action.

No event SHALL contain a password.

#### Scenario: Denied disable
- **WHEN** a MANAGER tries to disable a user of another role in their department
- **THEN** `TEAM_MEMBER_ADMIN_DENIED` with `action: "disable"` is written and the response is 403

### Requirement: KPI and achievement auditing
The system SHALL audit:
- `KPI_CREATED`, `KPI_UPDATED` and `KPI_DELETED`, with the subject user;
- `KPI_CHANGE_DENIED`;
- `ACHIEVEMENT_AWARDED`, as a system event with the achievement code and the user.

#### Scenario: Achievement awarded
- **WHEN** the automation awards TOP_MONTH
- **THEN** an `ACHIEVEMENT_AWARDED` event without an actor and with `metadata.code = "TOP_MONTH"` is written

### Requirement: Profile change events
The system SHALL audit:
- `PROFILE_UPDATED`, with the names of the changed fields but never their values;
- `PROFILE_PHOTO_UPDATED` and `PROFILE_PHOTO_REMOVED`, for a user's own photo;
- `TEAM_MEMBER_PHOTO_REMOVED`, when a director or head removes someone else's photo.

#### Scenario: Birth date change
- **WHEN** a user changes their date of birth
- **THEN** the `PROFILE_UPDATED` event lists `birthDate` and does not contain the date
