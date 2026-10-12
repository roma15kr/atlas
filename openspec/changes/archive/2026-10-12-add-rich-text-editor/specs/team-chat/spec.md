## MODIFIED Requirements

### Requirement: Messages and threads
A member SHALL be able to post a message of 1–4000 characters of formatted text (see `rich-text`) to a conversation they belong to, or to a public channel after joining it. The web client SHALL show the message formatted, keep line breaks and auto-link URLs.
- A message MAY be a reply to a top-level message of the same conversation, which puts it in that message's thread. Replies to replies SHALL be rejected with 400 `CHAT_INVALID_PARENT`.
- A top-level message SHALL expose its reply count and the time of its last reply.
- Messages SHALL be returned newest first, in pages of up to 50, with a cursor for older messages.

#### Scenario: Replying in a thread
- **WHEN** a member replies to a message
- **THEN** the reply appears in that message's thread and the message's reply count increases by one

#### Scenario: Non-member posting to a private channel
- **WHEN** a user who is not a member posts to a private channel
- **THEN** the response is 404 `CONVERSATION_NOT_FOUND` and nothing is stored

#### Scenario: Formatted message
- **WHEN** a member sends a message with a bulleted list and a bold word
- **THEN** every member sees the list and the bold word, and the conversation list shows the message as plain text

## ADDED Requirements

### Requirement: Mentions in formatted messages
Typing `@` in the message editor SHALL suggest colleagues as today, and the mention SHALL be saved as `@username`. Mentions SHALL be detected in formatted messages exactly as in plain ones, except inside inline code and code blocks, where `@username` is plain text.

#### Scenario: Mention in a list item
- **WHEN** a member writes `- согласовать скидку @semenets` and sends it
- **THEN** Семенець is notified, and the list item shows his name as a mention

#### Scenario: Mention inside code
- **WHEN** a member sends a code block containing `@semenets`
- **THEN** nobody is notified and the code shows `@semenets` as written
