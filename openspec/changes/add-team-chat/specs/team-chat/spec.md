# Spec Delta

## Purpose

Internal team communication inside Atlas: direct messages, group conversations and public or private channels with managed membership, threads, mentions, unread tracking and realtime delivery.

## ADDED Requirements

### Requirement: Chat directory
The system SHALL let every authenticated user list the ACTIVE users of their own company for starting conversations and mentioning people. Each entry SHALL include the id, full name, department name and job title. The list SHALL NOT include users of other companies, and SHALL NOT include KPI, consent or presence details beyond what the caller can already see.

#### Scenario: Employee opens the directory
- **WHEN** an EMPLOYEE requests the chat directory
- **THEN** every ACTIVE colleague of the company is listed with name, department and job title, and no one from another company

### Requirement: Direct messages
The system SHALL let a user open a direct conversation with one other ACTIVE user of the same company. It SHALL return the existing conversation when one already exists for that pair, so each pair has exactly one direct conversation. Only its two participants SHALL be able to see it or read its messages, whatever their roles.

#### Scenario: Opening an existing DM
- **WHEN** user A opens a direct conversation with user B for the second time, from either side
- **THEN** the same conversation is returned, with its history

#### Scenario: Director cannot read a DM
- **WHEN** a DIRECTOR requests the messages of a direct conversation they are not part of
- **THEN** the response is 404 `CONVERSATION_NOT_FOUND`

### Requirement: Group conversations
The system SHALL let a user start a group conversation with 3–20 ACTIVE participants from the same company, including themselves, and with an optional name of up to 80 characters.
- Any participant SHALL be able to add ACTIVE colleagues, up to 20 participants in total, rename the conversation, and leave it.
- A group has no admins.
- Only participants SHALL see it.
- A person added later SHALL see the full history.
- A group whose last participant leaves SHALL no longer be listed for anyone.

#### Scenario: Starting a group
- **WHEN** a user selects two colleagues in "Новое сообщение" and sends a message
- **THEN** a group conversation with three participants is created and all three see the message

#### Scenario: Too many participants
- **WHEN** a participant adds people so that the group would exceed 20 participants
- **THEN** the response is 400 `CHAT_MEMBER_LIMIT` and nobody is added

### Requirement: Channels
The system SHALL support named channels.
- **Name:** 1–80 characters, unique among the company's non-archived channels, case-insensitive.
- **Description:** optional, up to 500 characters.
- **Visibility:** `PUBLIC` or `PRIVATE`.

Who can do what:
- Only DIRECTORs and MANAGERs SHALL create channels. The creator becomes a channel admin and a member.
- A `PUBLIC` channel SHALL be visible to every user of the company. Any user SHALL be able to read its messages, join it and leave it.
- A `PRIVATE` channel SHALL be visible only to its members, and only a channel admin or a DIRECTOR SHALL add members.
- An EMPLOYEE's attempt to create a channel SHALL be rejected with 403 `CHAT_FORBIDDEN` and audited as `CHAT_CHANNEL_CREATE_DENIED`.

#### Scenario: Employee joins a public channel
- **WHEN** an EMPLOYEE browses channels and joins a public channel
- **THEN** they become a member and can post messages there

#### Scenario: Private channel is hidden
- **WHEN** a user who is not a member lists channels or requests a private channel by id
- **THEN** the channel is not listed and the request returns 404 `CONVERSATION_NOT_FOUND`

#### Scenario: Duplicate channel name
- **WHEN** a manager creates a channel named "продажи" while an active channel "Продажи" exists
- **THEN** the response is 409 `CHANNEL_NAME_TAKEN`

### Requirement: Channel management
A channel admin or a DIRECTOR SHALL be able to:
- change a channel's name, description and visibility;
- add and remove members;
- grant and revoke the admin role;
- archive and unarchive the channel.

A DIRECTOR managing a private channel they are not a member of SHALL see its name, description, member list and admins, but not its messages. A channel SHALL always keep at least one admin, so removing or demoting the last admin SHALL be rejected with 400 `CHAT_LAST_ADMIN`. Archived channels SHALL be read-only for everyone and hidden from the channel list unless requested. Management attempts by a non-admin SHALL return 403 `CHAT_FORBIDDEN` and be audited with an action ending in `DENIED`.

#### Scenario: Making a public channel private
- **WHEN** a channel admin changes a public channel to private
- **THEN** its current members keep access and everyone else loses it immediately

#### Scenario: Removing the last admin
- **WHEN** the only admin of a channel tries to leave or demote themselves
- **THEN** the response is 400 `CHAT_LAST_ADMIN` until another admin is appointed

#### Scenario: Posting to an archived channel
- **WHEN** a member sends a message to an archived channel
- **THEN** the response is 409 `CONVERSATION_ARCHIVED`

### Requirement: Company channel
Every company SHALL have one public channel named "Общий" that every ACTIVE user belongs to. New users SHALL be added automatically. Members SHALL NOT be able to leave it or be removed from it, and it SHALL NOT be archived or made private. Its admins SHALL be the company's DIRECTORs.

#### Scenario: New employee
- **WHEN** a manager creates a new employee account
- **THEN** that employee is a member of "Общий" and sees its history on first login

### Requirement: Messages and threads
A member SHALL be able to post a text message of 1–4000 characters to a conversation they belong to, or to a public channel after joining it. The web client SHALL render the text as plain text, with line breaks and URL auto-linking.
- A message MAY be a reply to a top-level message of the same conversation, which puts it in that message's thread. Replies to replies SHALL be rejected with 400 `CHAT_INVALID_PARENT`.
- A top-level message SHALL expose its reply count and the time of its last reply.
- Messages SHALL be returned newest first, in pages of up to 50, with a cursor for older messages.

#### Scenario: Replying in a thread
- **WHEN** a member replies to a message
- **THEN** the reply appears in that message's thread and the message's reply count increases by one

#### Scenario: Non-member posting to a private channel
- **WHEN** a user who is not a member posts to a private channel
- **THEN** the response is 404 `CONVERSATION_NOT_FOUND` and nothing is stored

### Requirement: Editing and deleting messages
An author SHALL be able to edit the text of their own message, which marks it as edited. An author SHALL be able to delete their own message. A channel admin or a DIRECTOR who is a member SHALL be able to delete any message in a channel, which is audited as `CHAT_MESSAGE_MODERATED`. A deleted message SHALL keep its place, with its text removed and a deleted flag set. Its thread replies SHALL remain.

#### Scenario: Editing another person's message
- **WHEN** a user edits a message they did not write
- **THEN** the response is 403 `CHAT_FORBIDDEN`

#### Scenario: Deleting a message with replies
- **WHEN** an author deletes a message that has thread replies
- **THEN** the message shows as "Сообщение удалено" and its replies remain readable

### Requirement: Mentions
The system SHALL treat `@username` in a message as a mention of that user when they are a member of the conversation. For a public channel, a mentioned non-member SHALL also be notified. The system SHALL treat `@channel` in a channel as a mention of every member.
- Only a channel admin, a DIRECTOR or a MANAGER SHALL use `@channel`. From anyone else it SHALL be stored as plain text without notifying.
- Mentions SHALL be stored per mentioned user.
- A mentioned user SHALL see the message in an "Упоминания" list and in a mention count until they read that conversation past it.
- Mentions of users outside the conversation's audience SHALL NOT notify them or reveal the message.

#### Scenario: Mentioning a colleague
- **WHEN** a member posts "@petrova посмотри договор" in a channel where Petrova is a member
- **THEN** Petrova's mention count increases and the message appears in her "Упоминания" list

#### Scenario: Mentioning someone outside a private channel
- **WHEN** a member mentions a user who is not a member of that private channel
- **THEN** that user receives no notification and cannot see the message

### Requirement: Read state and unread counts
The system SHALL keep, per member and conversation, the time up to which the member has read. The conversation list SHALL return, for each conversation, its unread message count, mention count, last message preview and last activity time. The list SHALL be ordered by last activity. Opening a conversation SHALL mark it read up to its newest message. The user's own messages SHALL never count as unread. A member MAY mute a conversation, which keeps it out of the total unread badge but still counts mentions.

#### Scenario: Unread badge
- **WHEN** two colleagues each post a message in a channel the user belongs to and has not opened
- **THEN** the channel shows 2 unread and the "Сообщения" navigation badge includes 2

### Requirement: Realtime delivery
The system SHALL push new, edited and deleted messages, membership changes and read-state changes over the authenticated Socket.IO connection. Each event SHALL go only to users who may currently see the affected conversation. A user removed from a conversation SHALL stop receiving its events immediately. Clients SHALL recover missed messages by re-fetching after reconnecting.

#### Scenario: Live message
- **WHEN** a member posts a message while another member has Atlas open
- **THEN** the other member's conversation and unread count update without reloading the page

#### Scenario: Removed member
- **WHEN** a channel admin removes a member from a private channel
- **THEN** that member receives no further events for the channel and the channel disappears from their list

### Requirement: Deactivated users
When a user is deactivated, the system SHALL remove them from every group conversation and channel. Their direct conversations and past messages SHALL stay readable to the other participants, with the author shown as deactivated, but nobody SHALL be able to post to a direct conversation with a deactivated user.

#### Scenario: Messaging a deactivated colleague
- **WHEN** a user posts to a direct conversation whose other participant is deactivated
- **THEN** the response is 409 `CONVERSATION_ARCHIVED`
