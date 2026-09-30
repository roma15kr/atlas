# Spec Delta

## MODIFIED Requirements

### Requirement: Deal link
The system SHALL allow a task to link only to a deal visible to the actor, including access to the deal's funnel. When a task is shown to a user who cannot access the linked deal's funnel, the task SHALL be returned without the deal summary.

#### Scenario: Link to invisible deal
- **WHEN** a task is created or updated with a `dealId` outside the actor's scope or in a funnel the actor cannot access
- **THEN** the response is 404 `DEAL_NOT_FOUND`

#### Scenario: Assignee without funnel access
- **WHEN** a MANAGER assigns a task linked to a restricted-funnel deal to an employee without access to that funnel, and the employee lists their tasks
- **THEN** the task is listed with `deal` set to null, and the deal title is not exposed
