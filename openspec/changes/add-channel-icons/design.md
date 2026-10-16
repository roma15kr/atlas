# Design

## Decisions

1. **Library.**
   - A curated list of about 80 `lucide-react` icons. Atlas already uses this icon set.
   - Each entry has a stable key (e.g. `megaphone`), a Russian name and search words, and a group: «Работа», «Продажи», «Склад и доставка», «Общение», «Люди», «Разное».
   - The web holds the components. The API holds only the icon and colour keys (`CHANNEL_ICON_KEYS`, `CHANNEL_ICON_COLORS`), and a unit test keeps the lists equal.
2. **Colours.** Ten user-chosen colours, keyed `slate`, `teal`, `green`, `lime`, `amber`, `orange`, `red`, `pink`, `violet` and `blue`.
   - The tile is the colour with a white icon, as in ClickUp.
   - Like stage colours, these are user-chosen data, which the design system allows outside the tokens.
3. **Storage.**
   - `chat_conversations.icon text NULL` holds `<icon key>:<colour key>` or null.
   - Anything else is rejected with 400 `CHAT_INVALID_ICON`.
   - An icon key that a later version drops falls back to «#» on display.
4. **Access.**
   - Part of the existing channel update (`PATCH /chat/channels/:id`), so channel admins and DIRECTORs only, and archived channels are read-only.
   - Others get 403 `CHAT_FORBIDDEN`, audited as other management attempts.
   - A change is audited with the field name `icon` among the changed fields, never the value of other fields.
5. **Display.**
   - `ConversationIcon` draws the library icon white on its colour in the 30px tile, or «#».
   - The picker is a popover like the reaction picker, opened from «Настройки канала» or by clicking the header tile when the viewer may manage the channel. It has a colour row, a search field, icons by group, and «Убрать иконку».
6. **Live.** The existing `chat:conversation-updated` event carries `icon`.
