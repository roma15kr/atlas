# Spec Delta

## MODIFIED Requirements

### Requirement: Session handling
The web app SHALL sign in through the API and keep the access token and user profile only in memory. It SHALL persist nothing but a signed-in hint, which it uses to restore the session on page load through the refresh cookie.
- It SHALL send the token as a Bearer header.
- On a 401, it SHALL transparently refresh once using the refresh cookie, sharing a single in-flight refresh within the tab and serializing refreshes across tabs.
- It SHALL return to the login screen when refresh fails.

#### Scenario: Expired access token
- **WHEN** an API call returns 401 and the refresh succeeds
- **THEN** the call is retried once with the new token without user action

#### Scenario: Refresh fails
- **WHEN** the refresh call is rejected
- **THEN** the in-memory session and the hint are cleared and the user is sent to `/login`

#### Scenario: Page reload
- **WHEN** a signed-in user reloads the page
- **THEN** the session is restored through `/auth/refresh` without showing the login screen, and no access token is found in browser storage

#### Scenario: Two tabs refresh at once
- **WHEN** two tabs of the same user need a refresh at the same moment
- **THEN** the refreshes run one after the other and both tabs stay signed in
