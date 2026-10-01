# Spec Delta

## ADDED Requirements

### Requirement: Edit team member
The system SHALL let a DIRECTOR change any company user's full name, job title, specialty, job description, role and department. It SHALL let a MANAGER change the full name, job title, specialty and job description of EMPLOYEEs in the manager's own department.
- Nobody SHALL change their own role.
- The last ACTIVE DIRECTOR SHALL NOT be demoted.
- A MANAGER or EMPLOYEE role SHALL require a department.

#### Scenario: Director moves an employee
- **WHEN** a DIRECTOR sets an employee's `departmentName` to a department that does not exist yet
- **THEN** the department is created, the employee moves into it, and `TEAM_MEMBER_UPDATED` is audited with the old and new department ids

#### Scenario: Manager changes a role
- **WHEN** a MANAGER sends `role` for an employee of their department
- **THEN** the response is 403 `ROLE_CHANGE_FORBIDDEN`, nothing changes, and `TEAM_MEMBER_ADMIN_DENIED` is audited

#### Scenario: Directors demote each other at once
- **WHEN** the only two ACTIVE DIRECTORs each demote the other at the same moment
- **THEN** one change succeeds and the other gets 409 `LAST_DIRECTOR`, so one ACTIVE DIRECTOR remains

### Requirement: Disable and enable team member
The system SHALL let a DIRECTOR disable or enable any other company user, and a MANAGER disable or enable EMPLOYEEs of their own department.
- Disabling SHALL revoke all of the user's refresh sessions, close their open sockets and mark them offline.
- Nobody SHALL disable themselves or the last ACTIVE DIRECTOR.
- The user's clients, deals and documents SHALL stay unchanged.

#### Scenario: Employee leaves the company
- **WHEN** a MANAGER disables an employee of their department
- **THEN** the employee's next API request and refresh get 401, their open socket is disconnected, they leave chat channels, their Telegram customers become unassigned, and `TEAM_MEMBER_DISABLED` is audited

#### Scenario: Disabling oneself
- **WHEN** a DIRECTOR tries to disable their own account
- **THEN** the response is 409 `CANNOT_DISABLE_SELF`

#### Scenario: Enabling again
- **WHEN** a DIRECTOR enables a disabled user
- **THEN** the user can sign in again and `TEAM_MEMBER_ENABLED` is audited

### Requirement: Reset member password
The system SHALL let a DIRECTOR reset the password of any other company user, and a MANAGER reset the password of EMPLOYEEs of their own department. The new password SHALL be a temporary password meeting the creation strength rule. A reset SHALL:
- clear the login lock and failed-attempt count;
- revoke all sessions;
- require the user to change the password at next sign-in.

The password SHALL never be returned or logged.

#### Scenario: Locked-out employee
- **WHEN** a MANAGER resets the password of a locked employee of their department
- **THEN** the employee can sign in with the temporary password at once, must then change it, and `PASSWORD_RESET` is audited

### Requirement: Directory including disabled members
The system SHALL return DISABLED users together with ACTIVE ones, each with its status, when a DIRECTOR or MANAGER lists the team with `status=all`, within the caller's usual scope. The default listing SHALL stay ACTIVE-only.

#### Scenario: Manager reviews leavers
- **WHEN** a MANAGER calls `GET /api/v1/team?status=all`
- **THEN** ACTIVE and DISABLED users of their department are returned with `status`
