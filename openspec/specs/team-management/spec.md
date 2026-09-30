# team-management Specification

## Purpose
Lets directors and managers onboard team members into departments with a strong initial password, lists the scoped team with profile, KPI and rating data, and records each user's monitoring consent.

## Requirements

### Requirement: Create team member
The system SHALL let a DIRECTOR or MANAGER create an ACTIVE user with a unique username (3-50 characters of letters, digits, `.`, `_`, `-`, stored lowercase), a full name, optional specialty, job title and job description, and an initial password of at least 12 characters containing a lowercase letter, an uppercase letter, a digit and a symbol. Passwords SHALL be stored as bcrypt hashes.

#### Scenario: Director creates a manager in a new department
- **WHEN** a DIRECTOR creates a MANAGER with `departmentName` that does not exist yet
- **THEN** the department is created (case-insensitive match, serialized with an advisory lock), the user is created in it, the response is 201, and a `TEAM_MEMBER_CREATED` audit event is written

#### Scenario: Duplicate username
- **WHEN** the username is already used in the company (case-insensitive)
- **THEN** the response is 409 `USERNAME_TAKEN`

#### Scenario: Weak password
- **WHEN** the initial password misses any required character class or is shorter than 12 characters
- **THEN** the response is 400 `VALIDATION_ERROR`

### Requirement: Department-safe creation policy
The system SHALL restrict who can create whom: EMPLOYEEs cannot create users; MANAGERs can create only EMPLOYEE accounts in their own department and cannot create departments; DIRECTORs can create any role, and MANAGER or EMPLOYEE accounts require a department.

#### Scenario: Manager tries to create a manager
- **WHEN** a MANAGER submits `role: MANAGER`
- **THEN** the response is 403 `MANAGER_EMPLOYEE_ONLY`

#### Scenario: Manager targets another department
- **WHEN** a MANAGER submits a `departmentName` or a different `departmentId`
- **THEN** the response is 403 `INVALID_DEPARTMENT`

#### Scenario: Director omits department for an employee
- **WHEN** a DIRECTOR creates an EMPLOYEE without `departmentId` or `departmentName`
- **THEN** the response is 400 `DEPARTMENT_REQUIRED`

### Requirement: Scoped team directory
The system SHALL return ACTIVE team members within the caller's record scope, each with department, specialty, job title and description, consent state, KPI list, a weighted KPI rating, and current presence.

#### Scenario: Employee lists the team
- **WHEN** an EMPLOYEE calls `GET /api/v1/team`
- **THEN** only the employee's own profile is returned

#### Scenario: Manager lists the team
- **WHEN** a MANAGER calls `GET /api/v1/team`
- **THEN** only ACTIVE users of the manager's department are returned

### Requirement: Monitoring consent record
The system SHALL let every user accept or withdraw the monitoring policy for a given policy version, storing the timestamp and version on the user and writing `MONITORING_CONSENT_ACCEPTED` or `MONITORING_CONSENT_WITHDRAWN` to the audit log.

#### Scenario: Accept policy
- **WHEN** a user sends `PATCH /api/v1/team/me/consent` with `accepted: true` and a `policyVersion`
- **THEN** `monitoring_consent_at` and `monitoring_consent_version` are set and returned

#### Scenario: Withdraw consent
- **WHEN** the user sends `accepted: false`
- **THEN** both consent fields are cleared
