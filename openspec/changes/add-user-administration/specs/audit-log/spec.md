# Spec Delta

## ADDED Requirements

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
