# Design

## Context

- Team chat: `MessagesPage.tsx` renders `ConversationView` (`items.map(→ MessageItem)` inside `.chat-main__messages`) and `ThreadPanel` (root `MessageItem`, «N ответов» divider, replies) inside `.chat-thread__messages`. `MessageItem` (`components/chat/ChatParts.tsx`) shows `HH:MM` only, the full date in `title`.
- Telegram: `TelegramPage.tsx` renders `messages.map(→ MessageBubble)` inside `.tg-chat__messages` (a flex column with `gap: 8px`).
- Both feeds are oldest-first arrays held in state, extended by `loadOlder` (prepend) and live `append`. `useScrollBack` restores the view after a prepend by distance from the end, so extra elements above the old first message do not move what the reader sees.
- Dates already format through `lib/format.ts` with `localeOf()` (uk-UA / ru-RU / en-GB). Time zone is the browser's, as for the existing `HH:MM`.

## Goals / Non-Goals

**Goals:** one day separator per local calendar day in conversations, threads and Telegram conversations; «Сегодня»/«Вчера»/date/date+year in three languages; the current day pinned at the top while scrolling.

**Non-Goals:** grouping consecutive messages by author; changing message times, the chat list or «Упоминания»; any API change.

## Decisions

1. **Derived at render, not stored.** A pure function turns the oldest-first array into rows (`day` | `message`). Prepending a page, appending live messages and deleting a message all re-derive, so a day can never get two separators. Alternative (separator flags in state) would need fixing up on every mutation.
2. **Local calendar day** via `getFullYear/getMonth/getDate` of `new Date(createdAt)` — the same clock as the `HH:MM` already shown, so a 23:50 message never sits under the next day's label.
3. **Labels:** today → `common:time.today`, yesterday → `common:time.yesterday`, same year → `Intl.DateTimeFormat(localeOf(), { day: 'numeric', month: 'long' })` (uk «12 листопада», ru «12 ноября», en «12 November»), other year → adds `year: 'numeric'`. Russian and Ukrainian `Intl` add «г.»/«р.» to a year; strip a trailing ` г.`/` р.` so it reads «28 декабря 2025», as in the spec. `now` is a parameter so tests are deterministic.
4. **Pinned label with CSS `position: sticky; top: 0`** on the separator, no scroll listeners: each separator sticks until the next one (a later sibling in the same container) pushes it out — the Telegram behaviour, at zero JS cost. A solid pill (`--surface`, `--line`, 11px/650, `--muted`) stays readable over messages scrolling under it.
5. **Accessible markup:** `<div role="separator" aria-label={label}><span>{label}</span></div>`, so tests and screen readers find `getByRole('separator', { name: 'Сегодня' })`. It is not a heading (it adds no outline noise).
6. **"Today" stays fresh enough without a timer:** labels recompute on every render (new messages, scrolling-triggered loads). A conversation left open over midnight with no new activity keeps «Сегодня» on yesterday's messages until something re-renders; the first new message re-renders the whole list. Accepted (see Least confident 2).
7. **Thread panel:** the root message gets its own separator; replies are split the same way. The existing «N ответов» divider stays between root and replies; if the first reply is on a new day, its day separator follows that divider.

Access rules: no new data or endpoints; DIRECTOR, MANAGER and EMPLOYEE see separators only over messages they already can read. No migration, no audit events, no env vars.

## Files

- `apps/web/src/lib/days.ts` (new): day key, day label and the row splitter.
- `apps/web/src/lib/days.test.ts` (new): unit tests of the above.
- `apps/web/src/components/chat/DaySeparator.tsx` (new): the separator element (shared by chat and Telegram; lives with chat parts).
- `apps/web/src/pages/MessagesPage.tsx`: `ConversationView` and `ThreadPanel` render rows with separators.
- `apps/web/src/pages/TelegramPage.tsx`: conversation renders rows with separators.
- `apps/web/src/styles.css`: `.day-separator` (sticky pill); Telegram feed keeps its `gap`.
- `apps/web/src/i18n/{uk,ru,en}/common.ts`: `time.today`, `time.yesterday`.
- `apps/web/src/pages/Chat.test.tsx`, `apps/web/src/pages/Telegram.test.tsx`: screen tests.

## Types and signatures

```ts
// lib/days.ts
export type DayRow<T> = { kind: 'day'; key: string; label: string } | { kind: 'item'; item: T };
export function dayKey(iso: string): string;                       // 'YYYY-MM-DD' in local time
export function dayLabel(iso: string, now?: Date): string;         // Сегодня | Вчера | 12 ноября | 28 декабря 2025
export function withDays<T extends { createdAt: string }>(items: readonly T[], now?: Date): DayRow<T>[];

// components/chat/DaySeparator.tsx
export function DaySeparator({ label }: { label: string }): JSX.Element;
```

## Call stack

- Open conversation: `ConversationView` → `useLiveMessages` loads page → `withDays(items)` → rows → `DaySeparator` / `MessageItem`.
- Scroll up: `useScrollBack.older` → `loadOlder` prepends → re-render → `withDays` recomputes (the shared day's separator moves to the new earliest message) → `useScrollBack` layout effect restores position from end.
- Live message: socket → `append` → re-render → a new day gets a separator above the new message.
- Thread: `ThreadPanel` → `DaySeparator(dayLabel(root.createdAt))` + root, divider, `withDays(items)`.
- Telegram: `TelegramPage` conversation → `withDays(messages)` → `DaySeparator` / `MessageBubble`.

## Test plan

`lib/days.test.ts` (fixed `now` = 2026-11-16 12:00 local, language set per test):
- `dayLabel` returns «Сегодня» for 2026-11-16 00:05 and «Вчера» for 2026-11-15 23:59 (ru).
- `dayLabel` returns «12 ноября» for 2026-11-12 and «28 декабря 2025» for 2025-12-28 (no «г.»), and uk «12 листопада», en «12 November» / «Today».
- `withDays` puts exactly one day row before the first item of each day, none between same-day items, and none for an empty list.
- `withDays` after prepending same-day items still yields one row for that day, before the earliest item.

`pages/Chat.test.tsx`:
- «shows a separator for each day in a conversation»: demo/mocked messages on 12 Nov, 13 Nov, yesterday and today → separators «12 ноября», «13 ноября», «Вчера», «Сегодня» in that order, each before its first message.
- «a live message on a new day gets «Сегодня»»: newest is yesterday, a socket `chat:message` arrives → a «Сегодня» separator appears.
- «thread panel separates root and replies by day».

`pages/Telegram.test.tsx`:
- «customer conversation shows day separators»: incoming yesterday, outgoing today → «Вчера», «Сегодня».

`i18n/dictionaries.test.ts` already checks every key exists in all three languages.

## Least confident decisions

1. Separators also in the thread panel (threads are usually short and same-day; it could be noise there). Kept for consistency with Telegram's comments view.
2. No midnight timer: a conversation left open over midnight shows a stale «Сегодня» until the next render.
3. Sticky labels in the narrow thread panel and on phones: should be fine (the pill is centred and short), but worth a look on a real iPhone.
4. Day + month without weekday («12 ноября», not «среда, 12 ноября»). Telegram omits the weekday; ClickUp shows it. Easy to add if the director prefers it.
