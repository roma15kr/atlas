# Spec Delta

## MODIFIED Requirements

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

### Requirement: Deal listing
The system SHALL list deals that are in the caller's record scope and in funnels the caller can access, ordered by last update. Each deal SHALL include its funnel id and a stage summary (id, name, color, outcome), plus client and owner summaries. The list SHALL be filterable by funnel, stage and client, with `limit`/`offset` pagination (default 25, max 100).

#### Scenario: Filter by client
- **WHEN** a user lists deals with `clientId`
- **THEN** only in-scope deals of that client in accessible funnels are returned

#### Scenario: Filter by funnel
- **WHEN** a user lists deals with `funnelId` of an accessible funnel
- **THEN** only in-scope deals of that funnel are returned

## REMOVED Requirements

### Requirement: Company deal stages
**Reason**: Stages now belong to funnels, are identified by id rather than a company-unique key, have an explicit outcome instead of a closed flag, and can be configured only by a DIRECTOR. This is covered by the new `crm-funnels` capability.
**Migration**: Existing stages move into one company-wide default funnel with their names, colors and order kept. Use `GET /api/v1/funnels` instead of `GET /api/v1/deals/stages`, and the Director-only funnel stage endpoints instead of `POST /api/v1/deals/stages`. Deal payloads use `funnelId` and `stageId` instead of `stage`.
