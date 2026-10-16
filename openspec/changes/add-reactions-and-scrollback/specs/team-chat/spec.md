## ADDED Requirements

### Requirement: Message reactions
A member of an active conversation SHALL be able to add and remove their own emoji reactions on its messages and thread replies, from a quick row (👍 ❤️ 😂 🎉 👀 ✅) or a searchable picker. Each message SHALL show every emoji used with its count, which ones are the viewer's, and who reacted. A reaction change SHALL reach the conversation's members immediately and SHALL NOT notify anyone.

#### Scenario: Acknowledging a message
- **WHEN** Тимошенко reacts 👍 to Денисюк's message in «Отдел продаж»
- **THEN** the message shows «👍 1» for everyone in the channel without reloading, highlighted for Тимошенко, and the chip's tooltip names him

#### Scenario: Taking a reaction back
- **WHEN** Тимошенко clicks his highlighted «👍 1»
- **THEN** the reaction is removed for everyone

#### Scenario: Not a member
- **WHEN** a user who reads a public channel without joining it tries to react
- **THEN** the response is 409 `CHAT_JOIN_REQUIRED` and nothing is stored

### Requirement: Scrolling back through a conversation
A conversation SHALL open on its newest messages and SHALL load earlier messages page by page as the user scrolls up, keeping the messages on screen in place, until the first message, after which «Начало переписки» is shown. A «Показать более ранние» button SHALL also load the previous page. In a conversation and in a thread, a new message SHALL scroll the view to the end only when the user was already at the end or wrote it; otherwise a «Новые сообщения ↓» button SHALL appear.

#### Scenario: Reading back
- **WHEN** a user scrolls to the top of a conversation with 180 messages
- **THEN** the previous 50 messages load above without the view jumping, and so on until «Начало переписки»

#### Scenario: Message arrives while reading history
- **WHEN** a colleague writes while the user is reading older messages
- **THEN** the view stays where it is and «Новые сообщения ↓» appears; clicking it scrolls to the new message

### Requirement: Reaction limits
The system SHALL accept only the emoji Atlas offers in its picker, refusing others with 400 `VALIDATION_ERROR`, and SHALL refuse a new emoji on a message that already has 20 distinct ones with 409 `REACTION_LIMIT`. Adding a reaction that exists, or removing one that doesn't, SHALL change nothing.

#### Scenario: Arbitrary text as a reaction
- **WHEN** a client sends the reaction «привет»
- **THEN** the response is 400 and nothing is stored
