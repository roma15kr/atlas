# sales-pipeline Specification

## Purpose
Tracks deals linked to clients through a configurable, company-wide stage pipeline, valued in Ukrainian hryvnia only.

## Requirements

### Requirement: Company deal stages
The system SHALL keep an ordered list of deal stages per company, each with an uppercase key, name, color, sort order and closed flag. Every company SHALL receive default stages APPLICATION, NEGOTIATION, INVOICE, PAYMENT (closed), SHIPMENT (closed) and LOST (closed) on production startup.

#### Scenario: Add a stage
- **WHEN** a DIRECTOR or MANAGER posts a new stage with a unique key
- **THEN** the stage is created for the whole company and `DEAL_STAGE_CREATED` is audited

#### Scenario: Employee adds a stage
- **WHEN** an EMPLOYEE posts a new stage
- **THEN** the response is 403 `FORBIDDEN`

### Requirement: Deals
The system SHALL store deals with title, client, owner, department (from the owner), stage, value (0 to 1,000,000,000), probability (0-100, default 10), expected close date and closed date, and SHALL let users create, read, update and delete deals within their record scope.

#### Scenario: Create deal for a visible client
- **WHEN** a user creates a deal for a client in their scope with an existing stage
- **THEN** the deal is stored, the response is 201, and `DEAL_CREATED` is audited

#### Scenario: Client outside scope
- **WHEN** the deal's client is not visible to the user
- **THEN** the response is 404 `CLIENT_NOT_FOUND`

#### Scenario: Unknown stage
- **WHEN** a deal is created or moved to a stage key that does not exist for the company
- **THEN** the response is 400 `INVALID_DEAL_STAGE`

### Requirement: Single operating currency
The system SHALL accept only `UAH` as deal currency (case-insensitive input, default UAH) and the database SHALL reject any other value.

#### Scenario: Foreign currency
- **WHEN** a deal is submitted with `currency: "USD"`
- **THEN** the response is 400 `VALIDATION_ERROR`

### Requirement: Deal listing
The system SHALL list deals in scope ordered by last update with stage name and color, client and owner summaries, filterable by stage and client, with `limit`/`offset` pagination (default 25, max 100).

#### Scenario: Filter by client
- **WHEN** a user lists deals with `clientId`
- **THEN** only in-scope deals of that client are returned
