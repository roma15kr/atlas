# Status
_Last updated: 2026-10-11 by Claude_

## Current focus
- **Built, not yet deployed** (on `main`, not pushed). Both need a push and a live check on the Coolify test app:
  1. `use-openai-for-ai-analysis`: AI analysis on OpenAI `gpt-6-luna`, distinct modes, every analysis stored with a История view, and nobody sees analyses others ran about them. `OPENAI_API_KEY` is already set in Coolify. Open tasks: 3.3 screenshots, 4.2 live check, 4.3 status.
  2. `add-in-app-feedback`: «Сообщить о проблеме» on every screen, with an automatic screenshot and a diagnostic log, a director inbox, and translation into anonymised GitHub issues. Open tasks: 7.2 screenshots, 7.3 live check; it needs `GITHUB_TOKEN` and `GITHUB_REPOSITORY` in Coolify.
- Open OpenSpec changes waiting for a live check: `add-email-client` (mailbox), `add-telegram-customer-inbox` (test bot), `add-alert-rules-and-scheduled-reports` (an automatic alert).

## Done recently
- Telegram: b2b's bot @rdoffbot now runs in Atlas (token and a new webhook secret set in Coolify; confirmed connected). b2b's notifybot catalog and `/start` stopped, as agreed. Employees reach only the customers they're responsible for; heads see their department's. A test now covers replies to a colleague's customer.
- Chat: the people picker reloads colleagues each time it opens, so new accounts appear without reloading the page.
- `update-default-funnel-stages` archived: a new company's default funnel and the demo now use Квалификация → Коммерческое предложение → Согласование условий → Заказ и поставка (open) → Отгрузка (won) → Проиграна (lost). The live funnel was renamed by hand, and the five test «Опт» funnels were deleted.
- Live Atlas now holds real data (2026-10-11). Test users, clients, deals, test reports and Telegram contacts were deleted in SQL after a `pg_dump` (`/tmp/atlas-before-cleanup.dump` inside the postgres container); audit rows were kept with `actor_id` cleared. Imported through the API as the director:
  - 19 staff in 8 departments, plus 16 active DIY promoters (from b2b.rdim.ua) in «Отдел DIY». Everyone has a one-time password.
  - 77 b2b.rdim.ua dealers as `ACTIVE` clients (`source = b2b.rdim.ua`, b2b id in `metadata.b2b`). Dealers of people who left (Жеревко, Кухарєв, Дубінчук) went to Денисюк.
  - 51 dealer Telegram ids as UNVERIFIED contacts. Staff Telegram ids were not imported; users have no Telegram field.
- Employee onboarding deck (`docs/onboarding`) revised for current features: 18 slides, new screenshots, PDF and HTML regenerated. The `.pptx` is still the August version and is marked outdated.
- Profile photo and personal details: birth date, phone, email, city, "about".
- Job description editor for every member, kept as AI input for later.
- 13 OpenSpec changes archived. Specs reorganised into 16 capabilities.
- `feat/crm-funnels` merged into `main` and deleted. The Coolify test app now deploys from `main`.

## Next steps
0. Review `add-rich-text-editor` (WYSIWYG Markdown editor, task comments, deal notes, pasted images). It needs approval of TipTap 3 before slice 2.
1. Run the three live checks above, then archive those changes.
2. Fold `messaging-integrations` into the email and Telegram specs once `add-email-client` is archived.
3. Feed job descriptions into the AI analysis.

## Open questions
- Three empty test chat groups («Группа mup…») still list the director as the only member; leave or remove them.
- In a group, the director sees neither «Добавить» nor «Покинуть», as if not a member; not investigated yet. Groups have no way to remove a member by design (team-chat spec).
- Should department heads see only their own Telegram customers instead of the whole department's?
- Two empty departments survived the cleanup because test task boards point to them; delete the boards and departments, or keep them.
- A fine-grained GitHub token for `roma15kr/atlas`, with Issues read/write, is still needed for problem reports.
- Should employees see colleagues in the Team directory? Today they see only themselves.
- Should a director see colleagues' full birth dates, not just day and month?
- Should employees be able to write or suggest their own job description?

## Known problems / gotchas
- `openspec validate --all --strict` fails on 13 older specs and changes whose requirement text is over 500 characters (a newer OpenSpec rule); new changes validate individually.
- `bpi.rdim.ua` (behind b2b.rdim.ua) answers without auth: `/users/1/type/admin` lists every dealer's email, phone and Telegram id, and `/control/diy-employees` lists promoters' phones. Needs auth.
- Deleting a user who has audit rows fails: the FK sets `audit_logs.actor_id` to NULL, which the append-only trigger refuses.
- Rotate the Coolify API token; it was pasted into an agent chat.
- Coolify still holds the old, empty `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` variables; they are unused and can be deleted.
- If a GitHub issue is created but saving its number fails, a retry could file a second issue. The window is a single database update, and it has not been seen.
- Screenshots are drawn from the page (modern-screenshot), so cross-origin images or canvas content may be missing from them.
- Before production:
  - take a `pg_dump` before running migrations 005–012;
  - set `MAIL_ENCRYPTION_KEY`;
  - set `BACKUP_AGE_RECIPIENT`, using your own age key; the test app uses a test-only key.
- API responses carry `X-Content-Type-Options` twice (from helmet and from Nginx). It's harmless, but an exact-match header check fails on it.
- A push to `main` rebuilds the test app, with about a minute of downtime.
