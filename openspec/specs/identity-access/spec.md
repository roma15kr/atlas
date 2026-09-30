# identity-access Specification

## Purpose
Authenticates Atlas users with username and password, issues short-lived access tokens and rotating refresh sessions, and enforces the DIRECTOR / MANAGER / EMPLOYEE record scope used by every other capability.

## Requirements

### Requirement: Password login
The system SHALL authenticate a user by case-insensitive username and password, and SHALL return an access token and the public user profile (including KPIs and rating) on success.

#### Scenario: Valid credentials
- **WHEN** an ACTIVE user posts a correct username and password to `POST /api/v1/auth/login`
- **THEN** the response contains `accessToken` and `user`, a refresh cookie is set, `failed_login_count` is reset, `last_login_at` is updated, and an `AUTH_LOGIN` audit event is written

#### Scenario: Invalid credentials
- **WHEN** the username is unknown, the password is wrong, the account is DISABLED, or the account is locked
- **THEN** the response is 401 `INVALID_CREDENTIALS` without revealing which condition failed, and an `AUTH_LOGIN_DENIED` audit event is written

#### Scenario: Manager without department
- **WHEN** a MANAGER with no department signs in with correct credentials
- **THEN** the response is 403 `MANAGER_DEPARTMENT_REQUIRED`

### Requirement: Brute-force protection
The system SHALL lock an account for 15 minutes after 5 consecutive failed logins, and SHALL rate-limit login attempts to 12 failed requests per 15 minutes per client IP.

#### Scenario: Fifth failure locks the account
- **WHEN** a user fails to log in for the fifth consecutive time
- **THEN** `locked_until` is set 15 minutes ahead and further attempts are rejected until it passes, even with the correct password

#### Scenario: Login rate limit
- **WHEN** a client exceeds 12 failed login requests within 15 minutes
- **THEN** the response is 429 `LOGIN_RATE_LIMITED`

### Requirement: Access tokens
The system SHALL issue signed JWT access tokens (issuer `atlas-api`, audience `atlas-web`, default TTL 15 minutes) and SHALL re-load the user on every authenticated request so that disabled users and role or department changes take effect immediately.

#### Scenario: Missing or invalid token
- **WHEN** a request to any `/api/v1` route other than `/auth/*` and `/health` has no valid Bearer token
- **THEN** the response is 401

#### Scenario: User disabled after token issue
- **WHEN** a user whose status is no longer ACTIVE presents an unexpired access token
- **THEN** the response is 401 `ACCOUNT_UNAVAILABLE`

### Requirement: Rotating refresh sessions
The system SHALL store refresh tokens only as HMAC hashes in an httpOnly cookie scoped to `/api/v1/auth`, SHALL rotate the token on every refresh within the same family, and SHALL revoke the whole family when a revoked token is reused.

#### Scenario: Successful refresh
- **WHEN** a valid, unexpired refresh cookie is posted to `/auth/refresh`
- **THEN** the old token is revoked with `replaced_by` set, a new token in the same family is issued, and a new access token is returned

#### Scenario: Reuse detection
- **WHEN** an already-revoked refresh token is presented
- **THEN** every token in its family is revoked and the response is 401 `REFRESH_REUSE_DETECTED`

#### Scenario: Logout
- **WHEN** `/auth/logout` is called
- **THEN** the presented refresh token is revoked, the cookie is cleared, and the response is 204

### Requirement: Role and record scope
The system SHALL scope every record query by company and role: a DIRECTOR sees all company records, a MANAGER sees records whose department equals the manager's department, and an EMPLOYEE sees only records they own or are assigned to. Scope SHALL be enforced in SQL predicates, not only in route role checks.

#### Scenario: Employee reads another user's record
- **WHEN** an EMPLOYEE requests a client, deal, task, or message owned by someone else
- **THEN** the response is 404 as if the record does not exist

#### Scenario: Manager outside department
- **WHEN** a MANAGER requests a record belonging to another department
- **THEN** the response is 404

### Requirement: Owner assignment within scope
When a record is created or reassigned with an owner or assignee, the system SHALL accept only an ACTIVE user the actor can manage: any company user for a DIRECTOR, a same-department user for a MANAGER, and only the actor themself for an EMPLOYEE. The record's department SHALL be taken from the chosen owner.

#### Scenario: Employee supplies another owner
- **WHEN** an EMPLOYEE creates a client with `ownerId` of a colleague
- **THEN** the client is owned by the employee, not the colleague

#### Scenario: Manager assigns outside department
- **WHEN** a MANAGER assigns a task to a user in another department
- **THEN** the response is 403 `INVALID_OWNER`
