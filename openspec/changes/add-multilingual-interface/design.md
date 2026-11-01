# Design

## Context

- **Web:** about 2,700 Russian text fragments in 84 files, and error maps per area (`chatErrors`, `boardErrors`, `funnelErrors`, `mailErrors`, …).
- **API:** about 630 lines with Russian, mostly notification titles and bodies, reminders, alert texts, report texts, mail and Telegram helpers, and AI prompts.

## Decisions

1. **Library** (ADR 0006): `i18next` + `react-i18next`.
   - The resources are bundled; there are no network loads, since the bundle is small and offline use (PWA) must keep working.
   - Keys are typed through i18next's `CustomTypeOptions` with the Ukrainian dictionary as the source of truth. A key missing in Russian or English fails `tsc`, enforced with `satisfies` on each dictionary.
   - Namespaces follow the areas: `common`, `shell`, `auth`, `crm`, `sales`, `tasks`, `chat`, `mail`, `telegram`, `team`, `profile`, `reports`, `dashboard`, `ai`, `errors`, `notifications`.
2. **Choosing the language.**
   - Before sign-in: `localStorage['atlas.language']` (only a convenience, never auth), else `navigator.languages` (`uk`, `ru` or `en`), else `uk`.
   - After sign-in: `user.language` from the session wins, and is written back to `localStorage`.
   - The profile switch calls `PATCH /profile { language }`, then `i18n.changeLanguage()`, which re-renders at once.
   - `<html lang>` follows the language.
3. **Formatting.**
   - `lib/format.ts` (`formatDate`, `formatDateTime`, `relativeTime`, `formatMoney`, `plural`) reads the active language. It uses `Intl` with `uk-UA`, `ru-RU` and `en-GB` (day-month dates, 24-hour clock).
   - Money stays in UAH with «₴» / «UAH».
   - Plurals use i18next's `count` with `Intl.PluralRules` (`_one`/`_few`/`_many`/`_other`), replacing the hand-written Russian `plural()` forms.
4. **Server texts.**
   - `notify()` takes `{ key, params }` and renders it per recipient. Recipients are grouped by `users.language`, one row per recipient as today, so a stored notification keeps the language it was created in.
   - Server templates live in `apps/api/src/i18n/{uk,ru,en}.ts`, a small typed module. The API needs only a few dozen templates, so it doesn't use i18next.
   - Push payloads use the stored row.
   - Reminders, alerts and AI prompts take the recipient's or reader's language: the AI is asked to «answer in Ukrainian/Russian/English».
5. **Errors.** The API keeps English messages and stable codes. The web maps codes to text in the `errors` namespace, with one shared lookup replacing the per-area maps.
6. **Tests.**
   - `apps/web/src/test/setup.ts` sets the language to `ru`, so existing tests and their Russian assertions keep working unchanged.
   - New tests cover the default (Ukrainian), switching, and spot checks of each language per area.
   - API tests set the recipient's language where a text is asserted.
   - A dictionary test checks that the three languages have the same keys and placeholders.
7. **Rollout.** Users start in Ukrainian after the deploy, since the migration defaults to `uk`. The announcement tells them how to switch.

## Risks / Trade-offs

- **Size:** every screen changes. It is done in reviewable stages (see tasks), each passing the gate. Screens are converted area by area, and the dictionary test keeps the three languages in step.
- **Translation quality:** the texts are written by the agent and reviewed by the director in atlas-dev before `main`. The English terms follow the existing English specs.
- **Notifications already stored** stay in Russian; only new ones follow the reader's language.
