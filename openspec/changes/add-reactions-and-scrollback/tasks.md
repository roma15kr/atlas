# Tasks

## 1. Chat reactions

- [ ] 1.1 Add `database/021_reactions.sql`, the shared emoji list with Russian names, chat reaction endpoints, `reactions` in message and thread payloads, and `chat:reactions`. Verify a new `reactions.integration.test.ts`: add, count, remove, idempotence, an unknown emoji (400), 20-emoji limit (409), a non-member/archived conversation refused, members receive `chat:reactions`. Commit.
- [ ] 1.2 Add `ReactionBar`, `ReactionPicker` and `EmojiPicker`, and use them in chat messages and thread replies with a demo branch and live updates. Verify `Reactions.test.tsx` cases (quick reaction, toggle off, picker search «огонь» finds 🔥, names in the title, live update from a socket event); commit.

## 2. Task comment reactions

- [ ] 2.1 Task comment reaction endpoints with `scopedTask` access and `reactions` in comment payloads; use the reaction components in `TaskComments`. Verify API cases (someone who can't see the task gets 404) and a `TaskBoards.test.tsx` case; commit.

## 3. Scrolling back

- [ ] 3.1 Add `useScrollBack` (top sentinel, position kept, «Начало переписки», «Новые сообщения ↓» when not at the bottom) and use it in chat and threads. Verify hook unit tests with stubbed sizes and a `Chat.test.tsx` case for the new-messages button; commit.
- [ ] 3.2 Load older Telegram messages with the same hook. Verify a `Telegram.test.tsx` case with a conversation longer than one page; commit.

## 4. Integration checks

- [ ] 4.1 Run `make check` and `npm run build`; verify both pass.
- [ ] 4.2 Run `npx openspec validate add-reactions-and-scrollback --strict`; verify it passes.

## Workflow follow-up

- PR into `dev`; check reactions between two accounts and scrolling back through a long Telegram conversation on atlas-dev; `dev` → `main`; live check; archive.
