# Proposal

## Why

**Problem.** Every channel shows the same «#» tile, so «Общий», «Маркетинг» and the department channels look alike in the list and in notifications. People find a channel by reading its name.

**Evidence.** The director, 2026-10-16: «icon changing for channels», chosen from a library of icons the way an emoji is picked, not uploaded.

**Success metric.** A channel admin gives «Общий» an icon in a few seconds, and every member sees it in the chat list and the channel header right away.

## What Changes

- **Choosing an icon:** a channel admin or a director picks an icon for a channel in «Настройки канала» from a built-in library of about 80 line icons (megaphone, briefcase, truck, chart, cart and so on). The picker works like the emoji picker: groups, search in Russian, and «Без иконки».
- **Where it shows:** the icon replaces «#» in the chat list, the channel header and «Все каналы», on the usual tinted tile.
- **No icon:** a channel without one keeps «#» (or the lock for a private channel).
- **Audit and live updates:** changing the icon is audited with ids only, and reaches open screens live.

## Announcement

Channels can now have their own icon. A channel admin opens «Настройки канала» → «Иконка» and picks one from the library; everyone sees it in the chat list straight away.

## Non-goals

- Uploaded images, emoji or custom colours as channel icons.
- Icons for group conversations, which show their members.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `team-chat`: channels can have an icon from the built-in library.

## Impact

- **Data:** migration `023_channel_icons.sql` adds `chat_conversations.icon` (an icon key or null).
- **API:**
  - the channel update accepts `icon`, validated against the library's keys;
  - conversations carry `icon`.
- **Web:**
  - `ConversationIcon`;
  - an icon picker in channel settings;
  - the icon library (keys, Russian names, groups) shared with the API's list of keys.
  - The demo mirrors it.
