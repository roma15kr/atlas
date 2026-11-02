## MODIFIED Requirements

### Requirement: Helpful login screen
The login screen SHALL explain failures in the interface language (see `localization`) and warn about common typing mistakes:
- a wrong username or password, with a note that 5 failures lock the account for 15 minutes;
- 429 `LOGIN_RATE_LIMITED`: too many attempts, and in how many minutes to retry;
- a username that looks like a phone number or an email address;
- Caps Lock on while typing the password;
- Cyrillic letters in the username.

#### Scenario: Too many attempts
- **WHEN** the server answers 429 `LOGIN_RATE_LIMITED` with a reset in 7 minutes and the login screen is in Russian
- **THEN** the screen says «Слишком много попыток входа. Повторите через 7 мин.»

#### Scenario: Phone number typed as the username
- **WHEN** the user types `+38 (067) 445-38-58` as the username
- **THEN** a hint says to sign in with the login, not a phone number or email

#### Scenario: Cyrillic layout
- **WHEN** the user types `лщмфдсргл` as the username
- **THEN** a hint asks to switch the layout to Latin
