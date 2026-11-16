## 1. Tracer bullet: separators in team chat conversations

- [x] 1.1 Add `lib/days.ts` (`dayKey`, `dayLabel`, `withDays`) with `lib/days.test.ts` (today/yesterday/same year/other year without «г.»/«р.», uk/ru/en, one row per day, prepend keeps one row)
- [x] 1.2 Add `time.today` / `time.yesterday` to `common` in uk, ru, en
- [x] 1.3 Add `components/chat/DaySeparator.tsx` and the `.day-separator` sticky pill in `styles.css` (design tokens only)
- [x] 1.4 Render rows with separators in `ConversationView`; Chat.test: separators for 12 Nov, 13 Nov, «Вчера», «Сегодня» in order; a live message on a new day gets «Сегодня» (each test fails without the change)
- [x] 1.5 `make check && npm run build`; commit

## 2. Threads

- [x] 2.1 `ThreadPanel`: separator above the root and day separators among replies; Chat.test: root yesterday, replies today → «Вчера», «Сегодня»
- [x] 2.2 `make check && npm run build`; commit

## 3. Telegram customer conversations

- [x] 3.1 `TelegramPage` conversation renders rows with separators (sticky works inside its flex feed); Telegram.test: incoming yesterday, outgoing today → «Вчера», «Сегодня»
- [x] 3.2 `make check && npm run build`; commit

## 4. Look and finish

- [x] 4.1 Headless screenshots (demo mode) of a conversation, a thread and a Telegram chat at 1440 px in uk/ru/en and 390 px in ru; the pinned label checked on a scrolled Telegram feed
- [x] 4.2 `npx openspec validate --all --strict`
- [x] 4.3 Update STATUS.md (done, next steps: PR into `dev`, check «Общий» on atlas-dev, `dev` → `main`, archive)
