# Status
_Last updated: 2026-10-06 by Claude_

## Current focus
- **Built, not yet deployed** (on `main`, not pushed). Both need a push and a live check on the Coolify test app:
  1. `use-openai-for-ai-analysis`: AI analysis on OpenAI `gpt-6-luna`, distinct modes, every analysis stored with a История view, and nobody sees analyses others ran about them. `OPENAI_API_KEY` is already set in Coolify. Open tasks: 3.3 screenshots, 4.2 live check, 4.3 status.
  2. `add-in-app-feedback`: «Сообщить о проблеме» on every screen, with an automatic screenshot and a diagnostic log, a director inbox, and translation into anonymised GitHub issues. Open tasks: 7.2 screenshots, 7.3 live check; it needs `GITHUB_TOKEN` and `GITHUB_REPOSITORY` in Coolify.
- Open OpenSpec changes waiting for a live check: `add-email-client` (mailbox), `add-telegram-customer-inbox` (test bot), `add-alert-rules-and-scheduled-reports` (an automatic alert).

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
- A fine-grained GitHub token for `roma15kr/atlas`, with Issues read/write, is still needed for problem reports.
- Should employees see colleagues in the Team directory? Today they see only themselves.
- Should a director see colleagues' full birth dates, not just day and month?
- Should employees be able to write or suggest their own job description?

## Known problems / gotchas
- Coolify still holds the old, empty `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` variables; they are unused and can be deleted.
- If a GitHub issue is created but saving its number fails, a retry could file a second issue. The window is a single database update, and it has not been seen.
- Screenshots are drawn from the page (modern-screenshot), so cross-origin images or canvas content may be missing from them.
- Before production:
  - take a `pg_dump` before running migrations 005–012;
  - set `MAIL_ENCRYPTION_KEY`;
  - set `BACKUP_AGE_RECIPIENT`, using your own age key; the test app uses a test-only key.
- API responses carry `X-Content-Type-Options` twice (from helmet and from Nginx). It's harmless, but an exact-match header check fails on it.
- A push to `main` rebuilds the test app, with about a minute of downtime.
