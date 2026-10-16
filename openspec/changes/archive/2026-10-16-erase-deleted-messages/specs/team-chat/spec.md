## MODIFIED Requirements

### Requirement: Editing and deleting messages
An author SHALL be able to edit the text of their own message, which marks it as edited. An author SHALL be able to delete their own message. A channel admin or a DIRECTOR who is a member SHALL be able to delete any message in a channel, which is audited as `CHAT_MESSAGE_MODERATED`. Deleting a message SHALL erase it: its text, mentions, reactions, the notifications created for it and images that only it used. A message without thread replies SHALL disappear from the conversation; a message with replies SHALL keep a contentless «Сообщение удалено» line so its replies remain readable.

#### Scenario: Editing another person's message
- **WHEN** a user edits a message they did not write
- **THEN** the response is 403 `CHAT_FORBIDDEN`

#### Scenario: Deleting a message with replies
- **WHEN** an author deletes a message that has thread replies
- **THEN** the message shows as "Сообщение удалено" and its replies remain readable

#### Scenario: Deleting a message without replies
- **WHEN** an author deletes a message with an image, a reaction and a mention
- **THEN** the message disappears for everyone, the mentioned colleague's notification is gone, and the image no longer opens
