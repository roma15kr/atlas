# sales-pipeline Specification

## Purpose
Tracks deals linked to clients through a configurable, company-wide stage pipeline, valued in Ukrainian hryvnia only.

## Requirements

### Requirement: Deals
The system SHALL store deals with title, client, owner, department (from the owner), funnel, stage (a stage of that funnel), value (0 to 1,000,000,000), probability (0-100, default 10), expected close date and closed date. Users SHALL be able to create, read, update and delete deals within their record scope, in funnels they can access. When no stage is given, a new deal SHALL be placed in the first `OPEN` stage of its funnel.

#### Scenario: Create deal for a visible client
- **WHEN** a user creates a deal for a client in their scope, in a funnel they can access
- **THEN** the deal is stored, the response is 201, and `DEAL_CREATED` is audited

#### Scenario: Default stage
- **WHEN** a deal is created with a `funnelId` and no `stageId`
- **THEN** the deal is placed in that funnel's first `OPEN` stage

#### Scenario: Client outside scope
- **WHEN** the deal's client is not visible to the user
- **THEN** the response is 404 `CLIENT_NOT_FOUND`

#### Scenario: Unknown stage
- **WHEN** a deal is created or moved with a `stageId` that does not exist or does not belong to the deal's (or requested) funnel
- **THEN** the response is 400 `INVALID_DEAL_STAGE`

#### Scenario: Inaccessible funnel
- **WHEN** a user creates a deal in, or moves a deal to, a funnel they cannot access
- **THEN** the response is 404 `FUNNEL_NOT_FOUND`

### Requirement: Single operating currency
The system SHALL accept only `UAH` as deal currency (case-insensitive input, default UAH) and the database SHALL reject any other value.

#### Scenario: Foreign currency
- **WHEN** a deal is submitted with `currency: "USD"`
- **THEN** the response is 400 `VALIDATION_ERROR`

### Requirement: Deal listing
The system SHALL list deals that are in the caller's record scope and in funnels the caller can access, ordered by last update. Each deal SHALL include its funnel id and a stage summary (id, name, color, outcome), plus client and owner summaries. The list SHALL be filterable by funnel, stage and client, with `limit`/`offset` pagination (default 25, max 100).

#### Scenario: Filter by client
- **WHEN** a user lists deals with `clientId`
- **THEN** only in-scope deals of that client in accessible funnels are returned

#### Scenario: Filter by funnel
- **WHEN** a user lists deals with `funnelId` of an accessible funnel
- **THEN** only in-scope deals of that funnel are returned

### Requirement: Deal close date follows the stage outcome
The system SHALL:
- set a deal's `closed_at` to the current time when the deal enters a WON or LOST stage without an explicit close date;
- keep the existing close date when the deal moves between closed stages of the same outcome;
- clear the close date when the deal moves to an OPEN stage.

#### Scenario: Deal won
- **WHEN** a deal moves from an OPEN stage to a WON stage
- **THEN** `closedAt` is set to the time of the move

#### Scenario: Deal reopened
- **WHEN** a won deal moves back to an OPEN stage
- **THEN** `closedAt` becomes null
