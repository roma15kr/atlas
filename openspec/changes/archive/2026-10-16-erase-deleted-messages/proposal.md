# Proposal

## Why

**Problem.** A deleted chat message still leaves traces:
- a «Сообщение удалено» line in its place;
- its reactions;
- the copy of its text kept in colleagues' notifications (the bell shows a preview of direct messages and mentions);
- any image pasted into it, which stays in storage.

People expect a deleted message to be gone.

**Evidence.** The director, 2026-10-16, with a screenshot of «Сообщение удалено» under his name: «Whether user delete message — don't store it in the system».

**Success metric.** After a deletion, nothing of the message can be found in Atlas: not in the conversation, not on any bell, not in image storage. The only exception is the anchor line described below. Checked live by deleting a test message with an image and a mention.

## What Changes

- **Deleting a message removes it completely:** its text, reactions and mentions, the notifications created for it, and images pasted into it that nothing else uses.
- **A message with thread replies** keeps a contentless «Сообщение удалено» line, so colleagues' replies stay readable in their thread. No text, image or reaction of it remains.
- **Deletions made before this change are cleaned the same way when it deploys:** removed, or reduced to the anchor line when they have replies.
- **Moderation is audited, as before** (`CHAT_MESSAGE_MODERATED` with ids only), so a director can still see that a message was removed, but not what it said.

## Announcement

Deleting a message in chat now removes it for good: its text, images, reactions and the notifications about it. Only when others have replied in its thread does a short «Сообщение удалено» line stay, so their answers keep their context.

## Non-goals

- Recalling pop-ups already shown on someone's screen or phone.
- Deleting Telegram messages (customers keep what they received) or emails.
- An undo for deletion.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `team-chat`: deleting a message erases it, keeping only a contentless anchor for a thread with replies.

## Impact

- **Data:**
  - migration `022_erase_deleted_messages.sql` removes already-deleted messages without replies, and clears reactions of the rest;
  - chat notifications record the message they are about, so they can be removed with it.
- **API:** `DELETE /chat/messages/:id`.
- **Web:** a removed message disappears live for everyone in the conversation.
