# Proposal

## Why

**Problem.** On 2026-10-14 staff could not sign in: «Too many login attempts» (Ковальчук, office), and others "get in only after 3–4 attempts".
- Failed logins are limited to 12 per 15 minutes **per IP address**. Everyone in an office shares one public IP, so a few colleagues mistyping block the whole office, including people typing the right password.
- The login screen shows raw English server errors («Invalid username or password», «Too many login attempts»), and says nothing about Caps Lock or the keyboard layout. Staff work with the РУС/УКР layout on, so a Latin username typed in Cyrillic fails silently.

**Evidence** (production audit, 2026-10-14):
- Ковальчук signed in at 08:12 from 217.20.173.205, which he shares with Трубило, but no failed attempt of his was recorded.
- The failures that filled the limit are invisible in «Аудит»: a denied login for an unknown username (e.g. `лщмфдсргл`, «kovalchuk» typed in Cyrillic) is stored without a company, and the audit list shows only the company's rows.
- Драгун had 7 failures in 75 seconds the same morning (8 the day before).

**Success metric.** No «слишком много попыток» reports from people in an office during the first month, and no "it took several tries" reports after the hints ship. Checked by asking the heads after two weeks.

## What Changes

- **The login rate limit counts per username from an IP, not per IP:** 12 failed attempts per 15 minutes for each username from one address. One person's typos no longer lock out their colleagues.
- **A per-IP ceiling stays against password guessing:** 60 failed attempts per 15 minutes from one address, across all usernames. That is far above what a 20-person office produces.
- **The per-account lockout is unchanged:** 5 failures lock the account for 15 minutes, and the answer still doesn't reveal it.
- **The login screen speaks Russian and helps:**
  - «Неверный логин или пароль. После 5 неудачных попыток вход блокируется на 15 минут.»
  - «Слишком много попыток входа. Повторите через N мин.» (from the server's retry time).
  - «Включён Caps Lock» while it is on in the password field.
  - «Логин вводится латиницей — переключите раскладку» when the username contains Cyrillic letters.
- **Directors see denied logins for unknown usernames in «Аудит»:** they are recorded under the company when the installation has exactly one company. (Atlas runs one company today.)

## Announcement

Signing in is calmer now: one person's mistakes no longer block the whole office, and the login screen explains in Russian what went wrong, warns when Caps Lock is on, and when the keyboard is on the Cyrillic layout.

## Non-goals

- Revealing that an account is locked (it stays indistinguishable from a wrong password).
- Changing the 5-attempt lockout or the 15-minute windows.
- CAPTCHA, 2FA, password reset by email.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `identity-access`: brute-force protection is per username and IP, with a per-IP ceiling; unknown-username denials are visible to directors; the login screen gives localized errors and keyboard hints.

## Impact

- **API:** `loginLimiter` key and a second ceiling limiter; audit company for unknown usernames.
- **Web:** `LoginPage` only.
- **Data:** none. No migration.
