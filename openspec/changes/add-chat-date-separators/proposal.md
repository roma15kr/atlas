# Proposal

## Why

**Problem.** A conversation shows only the time of each message (`10:59`, `13:29`, `08:45`, `19:49`), never the day. In «Общий» a message from 13:29 sits right above one from 08:45, and nothing says that the second one was written the next day, or a week later. To find out, a reader has to hover over each time. Telegram and ClickUp split a conversation by day with a «Сегодня» / «Вчера» / «15 ноября» line.

**Evidence.** The director, 2026-11-16, with a screenshot of «Общий»: messages are «shown only by time, but not by date. Change this like in ClickUp or Telegram».

**Success metric.** In any conversation, a reader tells on which day each message was written without hovering: every day that has messages starts with one separator, checked on «Общий» on atlas-dev in all three languages.

## What Changes

- **Day separators:** in every team conversation (direct, group, channel), in a thread and in a Telegram customer conversation, the first message of each calendar day is preceded by a centred line with the day: «Сегодня», «Вчера», «12 ноября», or «12 ноября 2025» for an earlier year. Days are counted in the reader's own time zone, as the message times already are.
- **Day stays in view, as in Telegram:** while scrolling through a long day, its label stays pinned at the top of the message feed until the next day's separator pushes it out.
- **Older messages:** when older messages load while scrolling up, a day split across two pages still gets exactly one separator.
- **Language:** labels follow the interface language (uk, ru, en).
- Message times stay as they are (hours and minutes; the full date on hover).

## Announcement

Conversations are now split by day, like in Telegram. Above the first message of each day you see «Сегодня», «Вчера» or the date, and the current day stays at the top while you scroll. This works in channels, groups, direct messages, threads and Telegram conversations with customers.

## Non-goals

- Collapsing consecutive messages of one author under a single name and photo (a separate change, if wanted).
- Changing how times are shown on messages, in the chat list or in «Упоминания».
- Jumping to a date or a calendar picker.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `team-chat`: conversations and threads show day separators.
- `telegram-inbox` (still a delta of the unarchived `add-telegram-customer-inbox`): customer conversations show day separators. This change only adds a requirement, so either may be archived first.

## Impact

- **Web only:** the team chat conversation view and thread panel, the Telegram conversation view, a shared day-label helper and separator, styles, and dictionary entries in three languages. Demo mode works unchanged (it uses the same views).
- **No API, data, migration or audit changes.**
