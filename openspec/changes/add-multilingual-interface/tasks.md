# Tasks

## 1. Foundation

- [x] 1.1 Add `i18next`, `react-i18next`, the typed dictionaries (`uk` source, `ru`, `en`), language detection, `<html lang>`, locale-aware `lib/format.ts` and plural keys; set the test language to `ru`. Verify: a dictionary test (same keys and placeholders in all three) and format tests per language. Commit.
- [x] 1.2 Add migration `026_user_language.sql`, `language` on the session user and `PATCH /team/me`, and the «Мова інтерфейсу» switch in «Профиль» (the demo mirrors it). Verify: an API case (an invalid language gets 400); `Profile` tests where switching to English changes the shell at once and survives a reload. Commit.

## 2. Screens

- [x] 2.1 Shell, login, navigation, notifications bell, feedback, offline page and manifest. Verify tests in `uk` and `en`. Commit.
- [x] 2.2 CRM, client card, sales funnel and deal windows, funnel settings. Verify tests. Commit.
- [x] 2.3 Tasks, boards, task dialog and comments, board settings. Verify tests. Commit.
- [x] 2.4 Chat, channels, groups, reactions and attachments. Verify tests. Commit.
- [x] 2.5 Mail and Telegram inboxes and settings. Verify tests. Commit.
- [x] 2.6 Dashboard, team, profile, documents, reports, achievements, audit, AI analysis, feedback inbox. Verify tests. Commit.
- [x] 2.7 Error codes in one `errors` namespace, replacing the per-area maps. Verify every code used by the web exists in three languages. Commit.

## 3. Server texts

- [x] 3.1 Typed server templates, and `notify()` rendering per recipient's language (bell, push), task reminders and overdue notices, AI signals, AI answers in the reader's language. Verify integration cases: one event notifies a Ukrainian and an English colleague, and each gets their language. Commit.

## 4. Docs and checks

- [x] 4.1 ADR 0006 (i18next); update `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/learnings.md` if needed, and the `web-workspace` purpose after archive. Commit.
- [ ] 4.2 Run `make check`, `npm run build`, and a headless-browser pass of every screen in all three languages at desktop and phone width; verify all pass with no overflowing text.
- [ ] 4.3 Run `npx openspec validate add-multilingual-interface --strict`; verify it passes.

## Workflow follow-up

- PRs into `dev` per stage, the director reviews the translations on atlas-dev, `dev` → `main`, archive.
