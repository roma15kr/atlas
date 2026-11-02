# Proposal

## Why

**Problem.** Atlas speaks only Russian. The team is Ukrainian: most names, clients and messages are already in Ukrainian, some colleagues prefer it, and partners or new hires may need English. Everyone has to read the whole interface, notifications and pop-ups in one language.

**Evidence.** The director, 2026-11-01: «make Atlas 3 lingual — Ukrainian, Russian and English (user can switch in settings)». Chosen with the director: Ukrainian by default, i18next as the library, and everything a person reads in the first release.

**Success metric.** Any user picks Українська, Русский or English in «Профиль». From then on every screen, message, notification, phone pop-up and AI answer they see is in that language, on every device they sign in from.

## What Changes

- **Three interface languages:**
  - Українська (default for everyone);
  - Русский;
  - English.
- **Each person picks theirs** in «Профиль → Язык интерфейса» (in each language's own name). The choice is stored on the account, so it follows them to every browser and phone, and applies at once without reloading.
- **Every screen in the chosen language:** navigation, buttons, forms, empty states, dialogs, confirmations, error messages, the login screen and the offline page. Dates, numbers, money (still ₴) and word endings («3 задачи», «3 tasks») follow the language too.
- **Text the server writes for a person is in that person's language:**
  - notifications on the bell, and phone and desktop pop-ups;
  - task reminders and overdue notices;
  - AI signals and the AI analysis answer.

  Each recipient gets their own language, even when one event notifies several people.
- **Not translated:** what people type or name. That covers messages, comments, client and deal data, and the names of boards, stages, funnels, channels and departments («Общий» stays «Общий» until an admin renames it).
- **Sign-in:** before signing in, the login screen follows the browser's language (Ukrainian as the fallback) and has a language switch.

## Announcement

Atlas now speaks Ukrainian, Russian and English. It starts in Ukrainian; to change it, open «Профиль» → «Мова інтерфейсу» and pick Українська, Русский or English. Your choice applies everywhere you sign in, including notifications on your phone.

## Non-goals

- Translating people's content (messages, notes, client data) or data names set up in Atlas.
- Telegram replies to customers and outgoing email text (they follow the conversation, not the staff member).
- More languages, or per-company default languages.

## Capabilities

### New Capabilities

- `localization`: interface languages, the per-user choice, localized formatting, and server texts in the recipient's language.

### Modified Capabilities

- `ui-design-system`: copy rules apply to the user's language instead of Russian only.
- `identity-access`: the login screen explains failures in the chosen language.
- `team-chat`: channel icon search works in the interface language.

## Impact

- **Dependencies:** `i18next` and `react-i18next` (approved by the director; ADR 0006).
- **Data:** migration `026_user_language.sql` adds `users.language` (`uk`, `ru` or `en`; default `uk`).
- **API:**
  - `PATCH /api/v1/team/me` (the own profile) accepts `language`, and the session's user carries it;
  - notifications, reminders, alerts and AI answers are written per recipient's language.
- **Web:**
  - dictionaries under `apps/web/src/i18n/{uk,ru,en}`;
  - every user-facing string moves into them;
  - `lib/format.ts` becomes locale-aware;
  - `public/offline.html` and the PWA manifest get the three languages.
- **Tests:** existing tests keep running in Russian through the test setup; new tests cover switching and each language.
- **Docs:** `AGENTS.md` («The UI is in Russian»), `docs/ARCHITECTURE.md`, and the `web-workspace` purpose line.
