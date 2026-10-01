# Spec Delta

## ADDED Requirements

### Requirement: Own password change
The system SHALL let an authenticated user change their password by giving the current password and a new one that meets the strength rule and differs from the current one. A successful change SHALL revoke all of the user's refresh sessions and issue a new session to the caller.

#### Scenario: Wrong current password
- **WHEN** the current password is wrong
- **THEN** the response is 400 `INVALID_CURRENT_PASSWORD` and `PASSWORD_CHANGE_DENIED` is audited

#### Scenario: Successful change
- **WHEN** the current password is correct and the new password is strong
- **THEN** sessions on other devices stop refreshing, the caller receives a working access token and refresh cookie, and `PASSWORD_CHANGED` is audited

### Requirement: Forced password change
The system SHALL mark a user as requiring a password change after an administrative reset. While the mark is set:
- `/api/v1` requests other than `/auth/*` SHALL get 403 `PASSWORD_CHANGE_REQUIRED`;
- socket connections SHALL be refused;
- login and refresh responses SHALL include `mustChangePassword: true`.

#### Scenario: Signing in after a reset
- **WHEN** a user signs in with a temporary password set by a reset and calls `GET /api/v1/clients`
- **THEN** the response is 403 `PASSWORD_CHANGE_REQUIRED` until they change their password
