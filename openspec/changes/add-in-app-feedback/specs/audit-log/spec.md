# Spec Delta

## ADDED Requirements

### Requirement: Feedback events
The system SHALL audit:
- `FEEDBACK_SUBMITTED`, with the kind and whether a screenshot and a log were attached;
- `FEEDBACK_ISSUE_CREATED`, written by the system, with the issue number;
- `FEEDBACK_DISMISSED` and `FEEDBACK_RETRIED`, by a director;
- `FEEDBACK_VIEWED`, when a director opens someone else's report with its screenshot.

Audit metadata SHALL NOT contain the report text, the translation or the log.

#### Scenario: Report submitted
- **WHEN** an employee sends a report with a screenshot
- **THEN** `FEEDBACK_SUBMITTED` is written with kind problem and screenshot true, and without the text
