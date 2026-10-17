# Proposal

## Why

**Problem.** Every channel shows the same «#» tile, so «Общий», «Маркетинг» and the department channels look alike in the list and in notifications. People find a channel by reading its name.

**Evidence.** The director, 2026-10-16: «icon changing for channels», chosen from a library «like in ClickUp», not uploaded.

**Success metric.** A channel admin gives «Общий» an icon in a few seconds, and every member sees it in the chat list and the channel header right away.

## What Changes

- **Choosing an icon, as in ClickUp:** a channel admin or a director opens a picker in «Настройки канала» or by clicking the channel's tile in its header. It shows a row of 10 colours for the tile, about 80 line icons by group (megaphone, briefcase, truck, chart, cart and so on), search in Russian, and «Убрать иконку».
- **Where it shows:** the chosen icon, white on its colour, replaces «#» in the chat list, the channel header and «Все каналы».
- **No icon:** a channel without one keeps «#» (or the lock for a private channel).
- **Audit and live updates:** changing the icon is audited with ids only, and reaches open screens live.

## Announcement

Channels can now have their own icon. A channel admin clicks the channel's icon and picks an icon and a colour, like in ClickUp. Everyone sees it in the chat list straight away.

## Non-goals

- Uploaded images, emoji, or free colour choice (the palette is fixed).
- Icons for group conversations, which show their members.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `team-chat`: channels can have a library icon on a palette colour.

## Impact

- **Data:** migration `023_channel_icons.sql` adds `chat_conversations.icon` (`<icon key>:<colour key>`, or null).
- **API:**
  - the channel update accepts `icon`, validated against the library's keys;
  - conversations carry `icon`.
- **Web:**
  - `ConversationIcon`;
  - an icon picker in channel settings;
  - the icon library (keys, Russian names, groups) and the colour palette, whose keys the API shares.
  - The demo mirrors it.
