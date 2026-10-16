# Design

## Context

- **What deletion does today:** `DELETE /api/v1/chat/messages/:id` sets `body = ''` and `deleted_at`, removes mentions, and emits `chat:message-updated`.
- **What is left:** the row, reactions (`chat_message_reactions`), notifications (`CHAT_DIRECT`/`CHAT_MENTION` rows hold a preview in `body` and point at the conversation, not the message), and `rich_text_images` rows uploaded for it.

## Decisions

1. **Without replies, the row is deleted.** Reactions and mentions cascade; the conversation's `last_message_at` is recomputed. Members get `chat:message-removed { conversationId, messageId }` and drop it from view.
2. **With replies, a contentless anchor stays.** The body is `''` (as today), `deleted_at` is set, and reactions are removed; the replies stay. When the last reply of a deleted root is itself deleted, the root row is deleted too.
3. **Notifications.**
   - Chat notifications store the message: `entity_type = 'chat_message'`, `entity_id = <message id>`. The link still goes to the conversation, and the DM collapse key stays per conversation.
   - Deleting a message deletes the notifications whose `entity_id` is that message, for every recipient.
   - A collapsed DM notification whose latest message is deleted is removed. Its earlier messages are still in the conversation.
4. **Images.**
   - Images whose `/api/v1/images/<id>` appears in the deleted body and that were uploaded by its author are deleted (row and stored object), unless the same URL still appears in another chat message, task description or comment, client notes or comments, deal notes, or a job description.
   - The check is a company-scoped `LIKE` per image.
5. **Migration `022`.**
   - Delete `chat_messages` rows with `deleted_at IS NOT NULL` and no replies.
   - Delete reactions of deleted messages that stay as anchors.
   - Past notifications point at conversations, not messages, so they can't be matched; they are left alone and expire after 90 days, as every notification does.
6. **Audit.** Unchanged: `CHAT_MESSAGE_MODERATED` for moderation, ids only.

## Risks / Trade-offs

- **No undo.** A deleted message cannot be restored, even by a director. That is the point of the request.
- **Image reuse check.** It is text-based: an image referenced only from an email draft or a document file is not detected and would be removed. Those don't embed Atlas images today.
