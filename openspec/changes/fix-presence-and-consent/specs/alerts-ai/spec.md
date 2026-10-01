# Spec Delta

## ADDED Requirements

### Requirement: Consent-gated activity metrics
The system SHALL include presence activity in AI analysis only for target users who have accepted the current monitoring policy. For other users, it SHALL mark activity as `consent: false` and SHALL NOT send presence figures to Claude.

#### Scenario: Analysis of a non-consenting employee
- **WHEN** a manager requests an EVALUATION of an employee without consent
- **THEN** the metrics contain `presence: { consent: false }` and the recommendations don't mention activity days
