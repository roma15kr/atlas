# Design

## Decisions

1. **Recipients**, computed when a message is posted and never including its author:
   - DM: the other member, unless they muted it (as today, `CHAT_DIRECT`).
   - GROUP and CHANNEL top-level messages: members not muted (`CHAT_MESSAGE`). Public-channel non-members get nothing.
   - Thread replies, in any kind: the root author plus earlier repliers who are still members and not muted (`CHAT_MESSAGE`). For a DM, the existing DM rule applies.
   - People mentioned get `CHAT_MENTION` only, and are removed from the lists above.
2. **Collapse.**
   - The collapse key is `chat:<conversation>` for all chat kinds. One unread row per person and conversation is updated in place.
   - Title: «Новое в #Общий» for channels, «Новое в «<group>»» for groups. Body: «<first name>: <preview>».
   - Web Push uses the same notification tag per conversation, so a phone shows one pop-up per conversation.
3. **Entity.** As for direct messages: `entity_type 'chat_message'` with the latest message's id, so deleting that message removes the row.
4. **Volume.** «Общий» has 20 members, so a message makes up to 19 rows. That is in line with other events; no batching is needed.

## Risks / Trade-offs

- **Noise in busy channels:** mitigated by the per-conversation collapse and the mute bell.
- **The «Общий» channel can be muted.** It is the company channel, so people who mute it miss announcements unless mentioned. Directors can use `@channel`, which still notifies everyone.
