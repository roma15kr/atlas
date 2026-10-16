# Proposal

## Why

**Problem.** Only direct messages and @mentions create a notification. A message in a channel such as «Общий», or in a group conversation, creates none, so nothing pops up on a phone or desktop when Atlas is closed. People read this as broken pushes.

**Evidence.** 2026-10-16: the director reports «still no messages from general channel — both iOS and Android». The same day in «Общий», Семенець: «уведомления так и не приходят… если приложение свёрнуто и закрыто», and Тимошенко confirms.

**Success metric.** With Atlas closed, a member of «Общий» who hasn't muted it gets a pop-up for a new message there within a minute, on Android and on an iPhone with Atlas installed on the home screen.

## What Changes

- **Group conversations** notify every other member who hasn't muted them, like direct messages.
- **Channels** notify every member who hasn't muted the channel about each new top-level message.
- **Thread replies** notify only the thread's people: the author of the first message and everyone who replied before.
- **No floods:** while unread, a conversation keeps a single notification per person, showing the latest message («Общий · Максим: …»). Pop-ups replace each other instead of piling up.
- **Mentions** still win: someone mentioned gets only the mention notification.
- **Turning it off:** a channel or group is muted with the existing bell in its header. «Профиль → Уведомления → Чат» still turns off desktop pop-ups for all chat.
- **Deleting** a message removes these notifications too, as for direct messages.

## Announcement

Atlas now notifies you about new messages in channels and group chats, including «Общий»: one notification per conversation until you read it. To stop a noisy channel, press the bell in its header to mute it. Mentions still reach you even in a muted channel.

## Non-goals

- Per-channel «only mentions» or schedule settings (mute covers it for now).
- Email or Telegram copies of chat notifications.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `notifications`: chat notifications cover group conversations, channels and thread replies.

## Impact

- **API:** `notifyChat` in `routes/chat.ts`; a new kind `CHAT_MESSAGE` in the «chat» group. No migration.
- **Web:** an icon for the new kind; mute wording in the conversation header.
- **Dependency:** `add-notifications` must be archived first, because it creates the `notifications` spec this change modifies.
