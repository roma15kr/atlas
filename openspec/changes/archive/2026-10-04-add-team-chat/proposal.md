# Proposal

## Why

"Сообщения" today is a customer inbox. Its only working action stores an "internal" message addressed to a free-text recipient, and nobody ever receives it. The team has no way to talk inside Atlas, so conversations about clients, deals and tasks happen in outside messengers and never reach the work records. The team needs internal chat that works the way ClickUp Chat does: direct messages, small group conversations, and channels whose membership the company controls.

## What Changes

- **Direct messages.** Any active user can message any other active colleague in the company. There is exactly one DM per pair of people.
- **Group conversations.** A user can start a conversation with 2–19 colleagues (3–20 people including themselves). Any participant can add people, and anyone can leave. A group conversation has no owner and optionally a name.
- **Channels, public or private.**
  - A **public** channel is visible to everyone in the company. Anyone can read and join it.
  - A **private** channel exists only for its members. People join it only when a channel admin adds them.
  - Directors and department heads (MANAGER) create channels.
  - The creator becomes the channel admin. Admins manage the name, description, visibility, members and other admins, and can archive the channel.
  - Directors can manage any channel's settings and members. They can't read a private channel unless they are a member.
  - Every company gets a public "Общий" channel. All current and future users are added to it automatically.
- **Messages.**
  - Plain text with line breaks and links.
  - Replies in a thread under any message.
  - Authors can edit and delete their own messages. Channel admins can delete any message in their channel.
  - Deleted messages show as "Сообщение удалено".
- **Mentions.** `@name` notifies a conversation member. `@channel` notifies every member of a channel and is limited to channel admins, directors and department heads. Mentions feed an "Упоминания" list and a mention badge.
- **Unread and realtime.**
  - Each person has read positions per conversation.
  - Unread counts appear per conversation and in the "Сообщения" navigation badge.
  - New, edited and deleted messages arrive live over the existing authenticated Socket.IO connection.
- **"Сообщения" screen** becomes the chat. On the left are sections for channels and direct messages with unread counts. In the middle is the conversation, with a composer that autocompletes mentions. On the right is a thread panel. Dialogs handle "Новое сообщение", "Каналы" (browse and join public channels) and channel settings, all following `ui-design-system`.
- **BREAKING (API)**: `POST /api/v1/messages` with `channel: INTERNAL` is removed. Internal messages go through the new `/api/v1/chat` endpoints.
- **Customer inbox moves.** The existing customer inbox and channel status move unchanged to a new "Входящие" screen at `/inbox`, until `add-email-client` replaces them.

## Capabilities

### New Capabilities
- `team-chat`: covers
  - direct, group and channel conversations, and who can see, join and manage each;
  - messages and threads, editing and deletion;
  - mentions, read positions and unread counts;
  - realtime delivery;
  - the company channel.

### Modified Capabilities
- `messaging-integrations`: the "Internal sending only" requirement is removed. External channels keep their current behavior.
- `audit-log`: channel creation, settings, membership and archive changes, and moderator deletions are audited, instead of internal message sends.

## Impact

- **Database:** migration `006_team_chat.sql` (plus a demo-only `006_team_chat_seed.sql`) adds:
  - tables `chat_conversations`, `chat_members`, `chat_messages` and `chat_mentions`;
  - the "Общий" channel for each company, with every active user added;
  - a trigger that adds new users to it.

  Existing `messages` rows stay as they are.
- **API:** a new `routes/chat.ts` and chat access predicates in `access.ts`. `socket.ts` gains chat rooms and events. `routes/messages.ts` loses the internal send path. User deactivation removes the person from conversations.
- **Web:**
  - a new chat `MessagesPage` with its dialogs;
  - the previous page moves to `InboxPage`;
  - chat state and socket events in `AppContext`;
  - demo data;
  - the navigation badge driven by real unread counts.
- **Depends on** `add-ui-design-system` for screen rules. No new runtime dependencies.
