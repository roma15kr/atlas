# Design

## Decisions

1. **Library.**
   - A curated list of about 80 `lucide-react` icons. Atlas already uses this icon set.
   - Each entry has a stable key (e.g. `megaphone`), a Russian name and search words, and a group: «Работа», «Продажи», «Склад и доставка», «Общение», «Люди», «Разное».
   - The web holds the components. The API holds only the list of keys (`CHANNEL_ICON_KEYS`), and a unit test keeps the two lists equal.
2. **Storage.** `chat_conversations.icon text NULL` stores the key. An unknown key is rejected with 400 `CHAT_INVALID_ICON`. A key that a later version drops falls back to «#» on display.
3. **Access.**
   - Part of the existing channel update (`PATCH /chat/channels/:id`), so channel admins and DIRECTORs only, and archived channels are read-only.
   - Others get 403 `CHAT_FORBIDDEN`, audited as other management attempts.
   - A change is audited with the field name `icon` among the changed fields, never the value of other fields.
4. **Display.**
   - `ConversationIcon` draws the chosen icon in the existing 30px `.chat-icon` tile (primary tint).
   - The picker is a popover like the reaction picker: a grid of icons by group, a search field, and «Без иконки».
5. **Live.** The existing `chat:conversation-updated` event carries `icon`.
