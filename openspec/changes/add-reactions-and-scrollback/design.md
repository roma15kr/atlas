# Design

## Context

- **Chat** messages are paged by the API (50, `before` cursor; index `chat_messages_conversation_time_idx`). The page `useLiveMessages` loads one page and older pages on a button. `ConversationView` scrolls to the end on every new last id.
- **Telegram** messages are paged the same way (index `telegram_messages_contact_time_idx`). The page loads the newest page only and scrolls to the end on every change.
- **Task comments** load all at once, oldest first.
- **Chat events** (`chat:message`, `chat:message-updated`) go to members through `emitToUsers`.

## Decisions

1. **Data** (migration `021_reactions.sql`):
   - `chat_message_reactions (message_id → chat_messages ON DELETE CASCADE, user_id → users ON DELETE CASCADE, emoji text, created_at)`, primary key `(message_id, user_id, emoji)`;
   - `task_comment_reactions` with the same shape on `task_comments`.
2. **Emoji allowlist.**
   - The server accepts only emoji from `reactions/emoji.ts`, a list of about 180 common emoji in categories, each with a Russian name and keywords. The API and the web each keep an identical `emoji.json` (they build separately); an API test asserts the two copies are the same, so they never drift.
   - At most 20 distinct emoji per message or comment (409 `REACTION_LIMIT`).
3. **API.**
   - `POST /chat/messages/:id/reactions { emoji }` and `DELETE /chat/messages/:id/reactions/:emoji`. Both are idempotent and return the message's reactions.
   - Same for `/tasks/comments/:id/reactions`.
   - Chat requires the caller to read the conversation, be a member and the conversation to be active (otherwise the existing chat errors).
   - Task comments require `scopedTask` for the comment's task (404 otherwise).
   - Message, thread and comment payloads include `reactions: [{ emoji, count, users: [{ id, fullName }] }]`, ordered by first use. It is aggregated in SQL with `json_agg`, one subquery per row.
4. **Realtime.** After a chat change the server emits `chat:reactions { conversationId, messageId, reactions }` to the conversation's members. Task comment reactions update for the person who reacts; others see them on the next open (comments have no realtime today).
5. **Web components.**
   - **`ReactionBar`:** chips with emoji and count, highlighted when `users` includes me, `aria-pressed`, and a `title` with the names (up to 10, then «и ещё N»).
   - **`ReactionPicker`:** the quick row, «+» opening `EmojiPicker` (search by Russian name or keyword, categories, keyboard arrows and Enter, Escape closes).
   - Used in chat messages, thread replies and `TaskComments`. On a phone the quick row opens from a «Реакция» button on the message.
6. **Scroll-back hook** (`useScrollBack`), shared by chat, threads and Telegram:
   - It renders a top sentinel watched by an `IntersectionObserver` (root: the scroll container, `rootMargin: 200px`).
   - When the sentinel is visible, `hasMore` is true and nothing is loading, it loads the older page.
   - Before inserting, it records `scrollHeight - scrollTop` and restores it after the render, so the view doesn't move.
   - It tracks whether the user is "at the bottom" (within 80px). A new message scrolls to the end only then; otherwise a «Новые сообщения ↓» button appears and clears on click or on reaching the bottom.
   - Without `IntersectionObserver` (jsdom), the «Показать более ранние» button remains the way to load.
   - Telegram gets `loadOlder` using the existing `messages(id, before)`.

## Risks / Trade-offs

- **Payload size.** Reactions with up to 10 names per emoji add a little to each message. Pages stay at 50 messages.
- **Emoji rendering** depends on the OS font. Common emoji are chosen for that reason.
- **The scroll position fix** relies on layout measurements that jsdom doesn't do. The hook's logic is unit-tested with stubbed sizes, and the visual behaviour is checked live.
