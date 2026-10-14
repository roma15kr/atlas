# Tasks

## 1. One person's typos don't block the office

- [ ] 1.1 Key `loginLimiter` by IP and username and add `loginIpLimiter` (60 per IP). Verify `auth` integration cases: 12 failures for one username from an IP give 429 for it while a colleague from the same IP still signs in; 60 failures across usernames from one IP give 429 for everyone there; a success doesn't count. Commit.
- [ ] 1.2 Record unknown-username denials under the company when there is exactly one. Verify the director sees them in `GET /audit?action=AUTH_LOGIN_DENIED`; commit.

## 2. Login screen

- [ ] 2.1 Map login errors to Russian with the retry time, and add the Caps Lock and Cyrillic-username hints. Verify `LoginPage` tests for each message and hint; commit.

## 3. Integration checks

- [ ] 3.1 Run `make check` and `npm run build`; verify both pass.
- [ ] 3.2 Run `npx openspec validate fix-office-login-limits --strict`; verify it passes.

## Workflow follow-up

- PR into `dev`, check on atlas-dev, then `dev` → `main` promptly (it's blocking staff). Live check, archive.
