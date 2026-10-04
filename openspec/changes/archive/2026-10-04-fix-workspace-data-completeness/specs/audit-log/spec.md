# Spec Delta

## ADDED Requirements

### Requirement: Profile change auditing
The system SHALL audit a user's own profile change as `PROFILE_UPDATED` with the names of the changed fields and without their values.

#### Scenario: Specialty changed
- **WHEN** a user changes their specialty
- **THEN** a `PROFILE_UPDATED` event with `fields: ["specialty"]` is written
