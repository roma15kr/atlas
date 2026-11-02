# 0006. Interface languages with i18next, server texts with typed templates
Date: 2026-11-02
Status: accepted

## Context
Atlas was written in Russian. The director asked for three interface languages (Ukrainian, Russian, English), chosen per person in the profile, with Ukrainian as the default. About 2,700 text fragments sat in 84 web files, and the API wrote notifications, reminders, alerts and AI answers in Russian.

## Decision
- **Web:** `i18next` with `react-i18next`. The dictionaries are TypeScript files in `apps/web/src/i18n/{uk,ru,en}/<namespace>.ts`, one namespace per area.
  - Ukrainian is the source. Russian and English are checked with `satisfies Dictionary<typeof uk>`, and `CustomTypeOptions` types every key, so a missing key fails `tsc`.
  - Plurals use the `_one/_few/_many/_other` suffixes in every language.
  - Components call `useTranslation`; module helpers call `i18n.t('ns:key')` and are read at render time, never cached in module constants.
  - Dates, numbers and sorting use `localeOf()` (`uk-UA`, `ru-RU`, `en-GB`).
- **Storage:** `users.language` (`uk` by default) is changed through `PATCH /team/me` and returned with the session. Before sign-in, the browser's choice is kept in `localStorage` (`atlas.language`).
- **API:** a small typed map in `apps/api/src/i18n/{uk,ru,en}.ts` with `{name}` placeholders, not i18next, because it needs only a few dozen templates.
  - `notify()` takes a template (`text(key, params)`) and renders it per recipient's language. A person's own words are passed as plain strings and are kept as written.
  - Alerts render when read, in the reader's language, from their rule and evidence.
  - AI answers follow the requester's language.

## Consequences
- New UI text needs a key in all three languages. `src/i18n/dictionaries.test.ts` and the API placeholder test catch gaps; tests run in Russian unless they switch languages.
- Data that people or the server stored keeps its language. This covers old notifications, Telegram message summaries, mail folder names from the server, KPI units and bootstrap stage names. Only the display of the special mail folders is translated.
- Translations were written by the agent; the director reviews them on atlas-dev before `main`.
