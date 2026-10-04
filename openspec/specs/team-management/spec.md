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

### Requirement: Self-service profile update
The system SHALL let any authenticated user change their own full name (2-160 characters) and specialty (up to 160 characters, or empty) through `PATCH /api/v1/team/me`. The change SHALL be audited as `PROFILE_UPDATED` with the changed field names only. Role, department, job title and job description SHALL NOT be changeable through this endpoint.

#### Scenario: Employee renames themselves
- **WHEN** an EMPLOYEE sends `{ "fullName": "Ирина Коваль" }`
- **THEN** their full name is updated, returned, and `PROFILE_UPDATED` is audited with `fields: ["fullName"]`

#### Scenario: Attempt to change role
- **WHEN** the body contains `role` or `departmentId`
- **THEN** the response is 400 `VALIDATION_ERROR` and nothing changes

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

### Requirement: Personal profile details
The system SHALL let any authenticated user set or clear their own date of birth, work phone, contact email, city, a short "about" text (up to 500 characters) and whether colleagues may see their birthday, through `PATCH /api/v1/team/me`.
- A date of birth SHALL NOT be in the future, before 1900-01-01, or make the person younger than 14.
- A phone SHALL contain only `+`, digits, spaces, parentheses and hyphens, with at least 5 digits.
- A contact email SHALL be a valid address.
- Unknown fields such as `role` or `departmentId` SHALL be refused with 400.

#### Scenario: Employee adds a birthday and a phone
- **WHEN** an EMPLOYEE sends `{ "birthDate": "1994-03-12", "phone": "+380 67 123 45 67" }`
- **THEN** both are saved and returned, and `PROFILE_UPDATED` is audited with `fields: ["birthDate", "phone"]` and without the values

#### Scenario: Birth date in the future
- **WHEN** the `birthDate` is tomorrow
- **THEN** the response is 400 `VALIDATION_ERROR` and nothing changes

#### Scenario: Clearing a field
- **WHEN** a user sends `{ "city": "" }`
- **THEN** their city becomes empty

### Requirement: Birthday privacy
The system SHALL return a user's full date of birth only to that user. To colleagues it SHALL return only the day and month, as `birthday: "MM-DD"`, and only while the user's `showBirthday` setting is on.

#### Scenario: Colleague views the directory
- **WHEN** a colleague loads `GET /api/v1/team` and Anna's birth date is 1994-03-12 with `showBirthday` on
- **THEN** Anna's row has `birthday: "03-12"` and no `birthDate`

#### Scenario: Birthday hidden
- **WHEN** Anna turns `showBirthday` off
- **THEN** her row for colleagues has no `birthday`, and her own session still has `birthDate`

### Requirement: Profile photo
The system SHALL let any authenticated user upload one profile photo, replace it and remove it.
- The photo SHALL be a JPEG, PNG or WebP image of at most 2 MB, identified by its content and not by its name or declared type.
- Each upload SHALL get a new random photo id. The previous photo SHALL stop being served and its stored object SHALL be deleted.
- Photos SHALL be served from `GET /api/v1/avatars/:id` without a token, with long immutable caching, and with `nosniff`.

#### Scenario: Uploading a photo
- **WHEN** a user uploads a 300 KB JPEG
- **THEN** their `avatarUrl` becomes `/api/v1/avatars/<new id>`, the URL serves the image with `Content-Type: image/jpeg`, and `PROFILE_PHOTO_UPDATED` is audited

#### Scenario: Disguised file
- **WHEN** a user uploads a text file named `photo.png` with type `image/png`
- **THEN** the response is 400 `UNSUPPORTED_IMAGE` and nothing is stored

#### Scenario: Replacing a photo
- **WHEN** a user uploads a second photo
- **THEN** the old URL returns 404 and the old object is deleted from storage

### Requirement: Remove a member's photo
The system SHALL let a DIRECTOR remove the photo of anyone in the company, and a MANAGER the photo of EMPLOYEEs in their own department, through `DELETE /api/v1/team/:id/avatar`, with the same scope rules as editing a member.

#### Scenario: Head removes an inappropriate photo
- **WHEN** a MANAGER removes the photo of an employee in their department
- **THEN** the photo is removed and `TEAM_MEMBER_PHOTO_REMOVED` is audited on that employee

#### Scenario: Employee tries to remove a colleague's photo
- **WHEN** an EMPLOYEE calls `DELETE /api/v1/team/<colleague>/avatar`
- **THEN** the response is 403 and the photo stays

### Requirement: Job description maintenance
The system SHALL store a job description of up to 20,000 characters for every member, set through `PATCH /api/v1/team/:id`. A DIRECTOR SHALL be able to set it for anyone in the company, including themselves, and a MANAGER for EMPLOYEEs of their own department. An empty value SHALL clear it. Each change SHALL be audited as `TEAM_MEMBER_UPDATED` with `jobDescription` among the field names and without the text.

#### Scenario: Head fills in an employee's description
- **WHEN** a MANAGER saves a 20,000-character description for an employee of their department
- **THEN** it is stored and returned, and the audit lists `jobDescription`

#### Scenario: Too long
- **WHEN** the description has 20,001 characters
- **THEN** the response is 400 and nothing changes

#### Scenario: Clearing
- **WHEN** the description is saved as an empty string
- **THEN** the member has no job description
