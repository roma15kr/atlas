# Design

## Decisions

1. **Storage.**
   - Reuse the avatar pipeline: `avatarUpload` (2 MB) and `detectImageType` for PNG, JPEG and WebP. The object goes to `objectStorage` under the company.
   - A row in a new `chat_channel_icons (id, company_id, conversation_id, storage_key, mime_type)` is served by `GET /api/v1/chat/icons/:id` to signed-in users of the same company, with `Cache-Control: private, immutable`.
   - `chat_conversations.icon_url` holds `/api/v1/chat/icons/<id>`. A new upload gets a new id, so caches never show the old image.
   - Replacing or removing the icon deletes the previous object after commit.
2. **Access.**
   - Same as other channel management: channel admin or DIRECTOR, otherwise 403 `CHAT_FORBIDDEN`, audited `CHAT_CHANNEL_ICON_DENIED`.
   - Success is audited `CHAT_CHANNEL_ICON_UPDATED` / `CHAT_CHANNEL_ICON_REMOVED` with the channel id.
   - An archived channel answers 409 `CONVERSATION_ARCHIVED`.
   - A channel outside the caller's view answers 404.
3. **Display.** `ConversationIcon` renders `<img>` in the 30px `.chat-icon` tile (radius 5px, `object-fit: cover`) when `iconUrl` is set. If the image fails to load, it falls back to «#».
4. **Live.** The existing `chat:conversation-updated` event carries the new `iconUrl`.

## Risks / Trade-offs

- **Unused objects:** an icon left when a channel is deleted stays in storage. Channels are archived, not deleted, so this is rare and acceptable.
