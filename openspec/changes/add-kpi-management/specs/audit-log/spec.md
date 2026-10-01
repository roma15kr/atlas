# Spec Delta

## ADDED Requirements

### Requirement: KPI and achievement auditing
The system SHALL audit:
- `KPI_CREATED`, `KPI_UPDATED` and `KPI_DELETED`, with the subject user;
- `KPI_CHANGE_DENIED`;
- `ACHIEVEMENT_AWARDED`, as a system event with the achievement code and the user.

#### Scenario: Achievement awarded
- **WHEN** the automation awards TOP_MONTH
- **THEN** an `ACHIEVEMENT_AWARDED` event without an actor and with `metadata.code = "TOP_MONTH"` is written
