# Spec Delta

## ADDED Requirements

### Requirement: Job description maintenance
The system SHALL store a job description of up to 20,000 characters for every member, set through `PATCH /api/v1/team/:id`. A DIRECTOR SHALL be able to set it for anyone in the company, including themselves, and a MANAGER for EMPLOYEEs of their own department. An empty value SHALL clear it. Each change SHALL be audited as `TEAM_MEMBER_UPDATED` with `jobDescription` among the field names and without the text.

#### Scenario: Head fills in an employee's description
- **WHEN** a MANAGER saves a 20,000-character description for an employee of their department
- **THEN** it is stored and returned, and the audit lists `jobDescription`

#### Scenario: Too long
- **WHEN** the description has 20,001 characters
- **THEN** the response is 400 and nothing changes

#### Scenario: Clearing
- **WHEN** the description is saved as an empty string
- **THEN** the member has no job description
