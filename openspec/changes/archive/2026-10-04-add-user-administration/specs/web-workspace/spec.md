# Spec Delta

## ADDED Requirements

### Requirement: Password change screens
The web app SHALL:
- offer "Изменить пароль" on the profile screen;
- show only a change-password screen while the session requires a password change, replacing the session after a successful change.

#### Scenario: Forced change after reset
- **WHEN** a user whose password was reset signs in
- **THEN** every route shows the change-password screen until the change succeeds, then the dashboard opens
