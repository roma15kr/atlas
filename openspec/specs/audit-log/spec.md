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
The system SHALL audit at least: login success and denial; team member creation; consent changes; client list, view, create, update, delete, comment and export success or denial; deal and stage changes; task changes; document upload, new version and download; report creation; alert acknowledgement; AI analysis requests; message send, denial and linking.

#### Scenario: Denied action
- **WHEN** a denied export or login occurs
- **THEN** an event whose action ends in `DENIED` is written

### Requirement: Audit viewer
The system SHALL let a DIRECTOR read all company audit events and a MANAGER read events of their department, newest first, filterable by action and entity type, each marked DENIED or SUCCESS by action suffix. EMPLOYEEs SHALL be refused.

#### Scenario: Employee opens audit
- **WHEN** an EMPLOYEE calls `GET /api/v1/audit`
- **THEN** the response is 403 `FORBIDDEN`
