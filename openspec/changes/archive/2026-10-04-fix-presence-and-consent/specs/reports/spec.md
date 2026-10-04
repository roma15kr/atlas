# Spec Delta

## ADDED Requirements

### Requirement: Consent-gated attendance
The system SHALL compute report attendance only from users who have accepted the current monitoring policy.
- A personal report for a user without consent SHALL contain `attendance.consent = false` instead of counts.
- A team report SHALL state how many team members are counted.

#### Scenario: Team attendance
- **WHEN** a team report is generated for 8 people of whom 6 consented
- **THEN** attendance counts only those 6 and reports `consentingUsers: 6` and `teamSize: 8`
