# Status
_Last updated: 2026-10-04 by Claude_

## Current focus
- AI project setup added with `ai-init`: `AGENTS.md`, `make check`, agent commands, product docs.
- `make check` now includes ESLint (ADR 0004), and `ci.yml` runs it.
- Active OpenSpec changes, all implemented. Each waits only for a live check before archiving:
  - `add-email-client`: needs a real mailbox (task 6.2);
  - `add-telegram-customer-inbox`: needs a test bot (task 5.2);
  - `add-alert-rules-and-scheduled-reports`: an automatically raised alert hasn't been seen on the test app yet (task 4.2).

## Done recently
- Profile photo and personal details: birth date, phone, email, city, "about".
- Job description editor for every member, kept as AI input for later.
- 13 OpenSpec changes archived. Specs reorganised into 16 capabilities.
- `feat/crm-funnels` merged into `main` and deleted. The Coolify test app now deploys from `main`.

## Next steps
1. Run the three live checks above, then archive those changes.
2. Fold `messaging-integrations` into the email and Telegram specs once `add-email-client` is archived.
3. Feed job descriptions into the AI analysis.

## Open questions
- Should employees see colleagues in the Team directory? Today they see only themselves.
- Should a director see colleagues' full birth dates, not just day and month?
- Should employees be able to write or suggest their own job description?

## Known problems / gotchas
- Before production:
  - take a `pg_dump` before running migrations 005–012;
  - set `MAIL_ENCRYPTION_KEY`;
  - set `BACKUP_AGE_RECIPIENT`, using your own age key; the test app uses a test-only key.
- API responses carry `X-Content-Type-Options` twice (from helmet and from Nginx). It's harmless, but an exact-match header check fails on it.
- A push to `main` rebuilds the test app, with about a minute of downtime.
