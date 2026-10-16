# Proposal

## Why

**Problem.** Every channel shows the same «#» tile, so «Общий», «Маркетинг» and the department channels look alike in the list and in notifications. People find a channel by reading its name.

**Evidence.** The director, 2026-10-16: «icon changing for channels», asked together with colleague photos in direct messages.

**Success metric.** A channel admin sets an image for «Общий» in under a minute, and every member sees it in the chat list and the channel header right away.

## What Changes

- **Setting the image:** a channel admin or a director can upload an image as the channel's icon in «Настройки канала», and remove it again. The image is PNG, JPEG or WebP, up to 2 MB, and is checked by its content, as profile photos are.
- **Where it shows:** the icon replaces the «#» tile in the chat list, the channel header and «Все каналы». It shows as a rounded square, so a channel never looks like a person.
- **No image:** a channel without one keeps the «#» (or the lock for a private channel).
- **Audit and live updates:** changing or removing the icon is audited with ids only, and reaches open screens live.

## Announcement

Channels can now have their own picture. A channel admin opens «Настройки канала» and chooses «Загрузить иконку»; everyone sees it in the chat list straight away.

## Non-goals

- Icons for group conversations, which show their members.
- Emoji or colour-only icons.
- Cropping in the browser; the image is shown centred and cut to the square.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `team-chat`: channels can have an icon image.

## Impact

- **Data:** migration `023_channel_icons.sql` adds `chat_conversations.icon_url`. Images are stored like avatars.
- **API:**
  - `PUT /chat/channels/:id/icon` (multipart `file`);
  - `DELETE /chat/channels/:id/icon`;
  - `GET /chat/icons/:id`, for signed-in users of the company;
  - conversations carry `iconUrl`.
- **Web:** `ConversationIcon`, plus the channel settings dialog. The demo mirrors it.
