# Proposal

## Why

**Problem.**
- Atlas is a desktop website: no app icon, and nothing that opens full-screen. Managers on the road (Ковальчук in the call centre, the DIY promoters in shops, Денисюк between meetings) use it in a phone browser tab.
- On a phone, «Мои задачи» is a sideways-scrolling board, chat and Telegram stack a list above a fixed-height conversation, and the 13-item sidebar hides behind a menu button.
- Desktop pop-ups now exist, but iPhones receive Web Push only from an app added to the home screen.

**Evidence.** The director, 2026-10-16: «Is there any possibility to make PWA or fast mobile app?», then «go ahead» for a PWA with phone layouts of the screens used on the go.

**Success metric.** Staff install Atlas on their phones and use tasks, chat, Telegram and notifications without zooming or sideways scrolling. Checked:
- live on an Android phone and an iPhone (install, push, the four screens);
- after two weeks, at least the sales department has installed it.

## What Changes

- **Installable app.**
  - Atlas gets a web app manifest (name, icons, the brand colour, full-screen «standalone» mode), so Chrome offers «Установить приложение» on Android and desktop, and iPhone Safari offers «На экран Домой».
  - «Профиль → Приложение» shows an install button where the browser supports one, or short iPhone instructions.
- **Phone navigation** (screens up to 640px): a bottom bar with «Задачи», «Сообщения», «Telegram», «CRM» and «Ещё», which opens the full menu. The bell stays at the top.
- **Phone layouts of the screens used on the go:**
  - **«Мои задачи»:** one status column at a time with tabs «Не начато / В работе / Готово» instead of a sideways board; the task dialog opens full-screen.
  - **Chat and the Telegram inbox:** the list or one conversation at a time, with a back button. The message box stays at the bottom above the keyboard.
  - **Notification panel:** a full-width sheet.
  - **Client card:** «Позвонить» and «Написать» as large buttons, sections one under another.
- **Touch-friendly basics:** tap targets of at least 40px, 16px text in inputs (no iPhone zoom on focus), and room for the iPhone notch and home bar.
- **Offline screen.** Without a connection the app shows «Нет подключения к интернету» with «Повторить» instead of the browser's error. Data is never stored for offline use.
- **Desktop and tablet layouts stay as they are.**

## Announcement

Atlas can now be installed on your phone. On Android open atlas.rdim.ua in Chrome and tap «Установить приложение»; on iPhone tap «Поделиться → На экран Домой». The app opens full-screen, receives notifications, and «Мои задачи», chat, Telegram and client cards are laid out for the phone.

## Non-goals

- App Store / Google Play listings or a native app.
- Working offline with data (reading or writing tasks without a connection).
- Phone layouts for the funnel board, reports, audit, settings and the team screen; they stay usable in the narrow layout they have today.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-workspace`: an installable app, phone navigation and an offline screen.
- `ui-design-system`: phone rules (640px and less).
- `tasks`: «Мои задачи» on a phone.
- `team-chat`: chat on a phone.
- `messaging-integrations`: the Telegram inbox on a phone.
- `crm-clients`: the client card on a phone.

## Impact

- **Web only:** `public/manifest.webmanifest`, icons (192, 512, maskable, Apple touch), `index.html` meta tags, a navigation fallback in `sw.js`, CSS for 640px and less, and a `useIsPhone()` hook where the structure changes (tabs, list-or-conversation, bottom bar).
- **No API or data changes.** Nginx serves the manifest with the right content type.
- **Verification limit:** this workspace has no runnable browser (its headless Chromium lacks `libnss3`), so layouts are tested in jsdom with a phone-sized `matchMedia`, and checked by eye on atlas-dev on a phone.
