# Spec Delta

## ADDED Requirements

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
