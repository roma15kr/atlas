# Spec Delta

## ADDED Requirements

### Requirement: Profile change events
The system SHALL audit:
- `PROFILE_UPDATED`, with the names of the changed fields but never their values;
- `PROFILE_PHOTO_UPDATED` and `PROFILE_PHOTO_REMOVED`, for a user's own photo;
- `TEAM_MEMBER_PHOTO_REMOVED`, when a director or head removes someone else's photo.

#### Scenario: Birth date change
- **WHEN** a user changes their date of birth
- **THEN** the `PROFILE_UPDATED` event lists `birthDate` and does not contain the date
