## MODIFIED Requirements

### Requirement: Brute-force protection
The system SHALL lock an account for 15 minutes after 5 consecutive failed logins. It SHALL rate-limit failed login requests to 12 per 15 minutes for each username from one client IP, and to 60 per 15 minutes per client IP across all usernames. People who share an office IP SHALL NOT exhaust each other's allowance.

#### Scenario: Fifth failure locks the account
- **WHEN** a user fails to log in for the fifth consecutive time
- **THEN** `locked_until` is set 15 minutes ahead and further attempts are rejected until it passes, even with the correct password

#### Scenario: Login rate limit
- **WHEN** a client exceeds 12 failed login requests for one username within 15 minutes
- **THEN** the response is 429 `LOGIN_RATE_LIMITED` for that username from that IP

#### Scenario: Colleague in the same office
- **WHEN** one person from an office IP has exceeded their 12 failed attempts, and a colleague from the same IP signs in with correct credentials
- **THEN** the colleague is signed in

#### Scenario: Many usernames from one address
- **WHEN** a client IP exceeds 60 failed login requests within 15 minutes, across any usernames
- **THEN** further login requests from it get 429 `LOGIN_RATE_LIMITED`

## ADDED Requirements

### Requirement: Denied logins visible to directors
When an installation has exactly one company, the system SHALL record `AUTH_LOGIN_DENIED` for an unknown username under that company, with the typed username and never the password, so it appears in the director's audit log.

#### Scenario: Phone number instead of the username
- **WHEN** someone tries to sign in as `+38 (067) 445-38-58`
- **THEN** the director sees an `AUTH_LOGIN_DENIED` event with that text as the username in «Аудит»

### Requirement: Helpful login screen
The login screen SHALL explain failures in Russian and warn about common typing mistakes:
- a wrong username or password: «Неверный логин или пароль», with a note that 5 failures lock the account for 15 minutes;
- 429 `LOGIN_RATE_LIMITED`: too many attempts, and in how many minutes to retry;
- a username that looks like a phone number or an email address;
- Caps Lock on while typing the password;
- Cyrillic letters in the username.

#### Scenario: Too many attempts
- **WHEN** the server answers 429 `LOGIN_RATE_LIMITED` with a reset in 7 minutes
- **THEN** the screen says «Слишком много попыток входа. Повторите через 7 мин.»

#### Scenario: Phone number typed as the username
- **WHEN** the user types `+38 (067) 445-38-58` as the username
- **THEN** a hint says to sign in with the login, not a phone number or email

#### Scenario: Cyrillic layout
- **WHEN** the user types `лщмфдсргл` as the username
- **THEN** a hint asks to switch the layout to Latin
