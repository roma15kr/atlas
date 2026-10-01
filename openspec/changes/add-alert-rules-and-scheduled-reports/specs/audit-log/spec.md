# Spec Delta

## ADDED Requirements

### Requirement: Report schedule auditing
The system SHALL audit:
- `REPORT_SCHEDULE_PAUSED`, with the reason;
- `REPORT_SCHEDULE_RESUMED`;
- `REPORT_DELETED`;
- `REPORT_RUN_COMPLETED`, as a system event with the run period.

#### Scenario: Scheduled run
- **WHEN** a recurring report runs
- **THEN** a `REPORT_RUN_COMPLETED` event without an actor is written
