# Tasks

## 1. Installable app

- [x] 1.1 Add the icon script and icons, `manifest.webmanifest`, `index.html` meta tags, the Nginx manifest type, the offline page and the navigation fallback in `sw.js`. Verify `serviceWorker.test.ts` cases (a failed navigation gets the offline page; `/api` and assets are not intercepted) and that the built `dist/` contains the manifest and icons; commit.
- [x] 1.2 Add «Профиль → Приложение» (install button on `beforeinstallprompt`, iPhone instructions, «установлено» in standalone). Verify `AppInstall.test.tsx` cases; commit.

## 2. Phone shell

- [x] 2.1 Add `useIsPhone()`, the bottom bar (5 items, «Ещё» opens the menu, unread badges), safe-area padding and the phone rules in `styles.css` (40px targets, 16px inputs, dialogs as sheets, notification panel full-width). Verify `PhoneShell.test.tsx` cases with a mocked phone `matchMedia`, and that desktop renders no bottom bar; commit.

## 3. Phone screens

- [ ] 3.1 «Мои задачи»: one category at a time with tabs on a phone. Verify `TaskBoards.test.tsx` phone cases; commit.
- [ ] 3.2 Chat and Telegram: the list or one conversation, «Назад», sticky composer. Verify `Chat.test.tsx` and `Telegram.test.tsx` phone cases; commit.
- [ ] 3.3 Client card: «Позвонить» and «Написать» action buttons, stacked sections. Verify the `ClientPage.test.tsx` phone case; commit.

## 4. Integration checks

- [ ] 4.1 Run `make check` and `npm run build`; verify both pass.
- [ ] 4.2 Run `npx openspec validate add-mobile-pwa --strict`; verify it passes.

## Workflow follow-up

- PR into `dev`; on an Android phone and an iPhone install from atlas-dev, turn on notifications, and walk through «Мои задачи», chat, Telegram and a client card. Then `dev` → `main`, live check, archive.
