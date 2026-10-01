# Spec Delta

## ADDED Requirements

### Requirement: Self-service profile update
The system SHALL let any authenticated user change their own full name (2-160 characters) and specialty (up to 160 characters, or empty) through `PATCH /api/v1/team/me`. The change SHALL be audited as `PROFILE_UPDATED` with the changed field names only. Role, department, job title and job description SHALL NOT be changeable through this endpoint.

#### Scenario: Employee renames themselves
- **WHEN** an EMPLOYEE sends `{ "fullName": "Ирина Коваль" }`
- **THEN** their full name is updated, returned, and `PROFILE_UPDATED` is audited with `fields: ["fullName"]`

#### Scenario: Attempt to change role
- **WHEN** the body contains `role` or `departmentId`
- **THEN** the response is 400 `VALIDATION_ERROR` and nothing changes
