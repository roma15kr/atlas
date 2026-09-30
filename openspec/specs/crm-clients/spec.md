# crm-clients Specification

## Purpose
Maintains the company's client database with owner- and department-scoped visibility, comments, access auditing, anti-scraping rate limits, and a director-only full export.

## Requirements

### Requirement: Client records
The system SHALL store clients with name, company name, email, phone, lead source, status (default `NEW`), notes, free-form metadata, an owner and the owner's department, and SHALL let users create, read, update and delete clients within their record scope.

#### Scenario: Create client
- **WHEN** a user creates a client
- **THEN** the owner is resolved by the owner-assignment rule, the client is stored, the response is 201, and `CLIENT_CREATED` is audited

#### Scenario: Reassign owner
- **WHEN** a DIRECTOR or MANAGER patches `ownerId` to a user they can manage
- **THEN** both owner and department move to the new owner, and `CLIENT_UPDATED` is audited with the changed fields

#### Scenario: Empty patch
- **WHEN** a patch contains no updatable fields
- **THEN** the response is 400 `NO_CHANGES`

### Requirement: Client listing and search
The system SHALL list clients in scope ordered by last update, filterable by status and by a case-insensitive search over name, company name and email, with `limit` (1-100, default 25) and `offset` pagination and a `meta.total` count.

#### Scenario: Search
- **WHEN** a user lists clients with `q=north`
- **THEN** only in-scope clients whose name, company name or email contains "north" are returned

### Requirement: Client access auditing
The system SHALL audit client list views (`CLIENT_LIST_VIEWED` with row count), single client views (`CLIENT_VIEWED`), creations, updates, deletions and comments.

#### Scenario: Viewing a client card
- **WHEN** a user opens a client
- **THEN** a `CLIENT_VIEWED` event with the client id and actor is appended to the audit log

### Requirement: CRM rate limit
The system SHALL limit each authenticated user to 180 requests to `/api/v1/clients` per 10 minutes.

#### Scenario: Scraping attempt
- **WHEN** a user exceeds 180 client requests in 10 minutes
- **THEN** further requests return 429 `CRM_RATE_LIMITED` until the window resets

### Requirement: Client comments
The system SHALL let any user who can see a client read its comments (newest first, with author) and add comments of 1-5000 characters.

#### Scenario: Comment on out-of-scope client
- **WHEN** a user comments on a client outside their scope
- **THEN** the response is 404 `CLIENT_NOT_FOUND`

### Requirement: Director-only full export
The system SHALL allow only a DIRECTOR to export the whole company client database as UTF-8 CSV with BOM, and SHALL audit both successful and denied export attempts.

#### Scenario: Director exports
- **WHEN** a DIRECTOR requests `GET /api/v1/clients/export.csv`
- **THEN** a CSV of every company client with owner and department names is returned and `CLIENT_EXPORT_SUCCEEDED` is audited with the row count

#### Scenario: Non-director export
- **WHEN** a MANAGER or EMPLOYEE requests the export
- **THEN** the response is 403 `DIRECTOR_ONLY` and `CLIENT_EXPORT_DENIED` is audited
