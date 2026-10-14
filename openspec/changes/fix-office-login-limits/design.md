# Design

## Context

- **The limiter:** `loginLimiter` (`middleware.ts`) is `express-rate-limit` with the default key `req.ip` (the Cloudflare visitor address, `clientIp.ts`), 12 per 15 minutes, `skipSuccessfulRequests`. Its memory store resets on restart.
- **The audit:** `AUTH_LOGIN_DENIED` for an unknown username is written with `auth: null`, so `company_id` is null and `GET /audit` (`al.company_id = $1`) never shows it.
- **The login page** prints `ApiError.message` as is.

## Decisions

1. **The per-account limiter.**
   - The key is `login:<ip>:<lower(trim(username))>`, read from the body.
   - `express.json` runs before the router; a missing or invalid username falls back to `login:<ip>:`.
   - It keeps the limit (12), the window and `skipSuccessfulRequests`.
2. **The ceiling limiter.** `loginIpLimiter` is keyed by IP: 60 failures per 15 minutes, `skipSuccessfulRequests`. It runs first; both answer 429 `LOGIN_RATE_LIMITED`. Standard `RateLimit` headers stay on, so the page can say when to retry.
3. **Unknown-username audit.**
   - When `SELECT count(*) FROM companies` is 1, the denial is written with that company id. With several companies it stays null, as today, so nothing crosses tenants.
   - Metadata stays `{ username }` (the typed name is needed to see layout mistakes). It is never the password.
4. **Login page.** It maps `INVALID_CREDENTIALS`, `LOGIN_RATE_LIMITED` (minutes from the `RateLimit` header's `reset`, else 15) and network errors to Russian texts.
   - **Caps Lock:** `getModifierState('CapsLock')` on key events in the password field.
   - **Cyrillic:** `/[А-Яа-яЁёЇїІіЄєҐґ]/` in the username.
   - The hints are shown as `form-hint` under the field.

## Risks / Trade-offs

- **An attacker can try more accounts from one IP.** That is now 12 per account and 60 in total per 15 minutes, against 12 in total before. The 5-failure account lockout still caps guesses per account at 5 per 15 minutes, so the real guessing rate per account does not change.
- **Recording unknown names keeps typed usernames in the audit log.** It already did; now the director can see them.
