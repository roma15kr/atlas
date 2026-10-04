# Spec Delta

## ADDED Requirements

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
