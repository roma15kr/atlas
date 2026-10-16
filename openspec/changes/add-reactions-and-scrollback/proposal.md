# Proposal

## Why

**Problem.**
- There is no quick way to acknowledge a message or a comment. People write «ок», «+» and «спасибо» as full messages, which notify and clutter long conversations.
- Long conversations are awkward:
  - **Chat** loads the newest 50 messages and needs a click on «Показать более ранние» for each older page.
  - **The Telegram inbox** never loads anything before the newest 50 messages, so older customer history is invisible.
  - **Both screens** jump to the bottom whenever a message arrives, even while someone is reading back.

**Evidence.** The director, 2026-10-16: «add reactions for messages and comments (like ClickUp) + as dialogues could be long — load last messages fast and then load the previous ones … after scrolling back (also like ClickUp)». Reactions were chosen for team chat and task comments, with a quick row plus a full picker.

**Success metric.** In conversations and task comments, people acknowledge with reactions instead of one-word messages, and nobody reports missing or jumping history. Checked:
- live: react, see a colleague's reaction appear, scroll back through a Telegram conversation longer than 50 messages;
- after two weeks, fewer «ок»/«+» messages in chat (spot check).

## What Changes

- **Reactions (ClickUp-style) on team chat messages, thread replies and task comments.**
  - Hovering a message (or tapping it on a phone) shows six quick reactions: 👍 ❤️ 😂 🎉 👀 ✅. The «+» button opens a searchable picker of about 180 common emoji with Russian names, built into Atlas.
  - Each emoji shows as a chip with its count. Your own reactions are highlighted, a click adds or removes yours, and hovering a chip lists who reacted.
  - Chat reactions appear live for everyone in the conversation. Reacting needs the same right as posting there (a member, and the conversation not archived). A task comment can be reacted to by anyone who can see the task.
  - Reactions don't create notifications and aren't audited (they're not sensitive).
- **Long conversations load from the end** (chat and the Telegram inbox; threads are short and load at once, and get the same «stay where I read» behaviour).
  - A conversation opens on its newest messages. Scrolling near the top loads the previous page by itself, keeping your place, until the beginning, which is marked «Начало переписки».
  - A «Показать более ранние» button stays available for keyboard users.
  - A new message keeps you at the bottom only if you were already there. Otherwise a «Новые сообщения ↓» button appears.

## Announcement

You can now react to messages and task comments: hover a message and pick 👍, ❤️, 😂, 🎉, 👀, ✅ or any emoji from «+». Long chats and Telegram conversations open on the latest messages and load earlier ones as you scroll up. Atlas no longer jumps to the bottom while you read history.

## Non-goals

- Reactions in the Telegram inbox, client comments or mail.
- Sending reactions to Telegram customers.
- Notifications about reactions.
- Paging task and client comments (they stay fully loaded).
- Custom or uploaded emoji.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `team-chat`: message reactions, and scrolling back through long conversations.
- `tasks`: reactions on task comments.
- `messaging-integrations`: scrolling back through a Telegram conversation.

## Impact

- **Data:** migration `021_reactions.sql` with `chat_message_reactions` and `task_comment_reactions` (one row per message or comment, person and emoji).
- **API:**
  - add and remove reaction endpoints for chat messages and task comments;
  - `reactions` included in message and comment payloads;
  - a socket event `chat:reactions`;
  - an allowlist of the picker's emoji.
- **Web:**
  - a shared `ReactionBar` and `EmojiPicker` (with a Russian emoji list);
  - a shared scroll-back hook used by chat, threads and Telegram.
