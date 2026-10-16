## MODIFIED Requirements

### Requirement: Chat and Telegram notifications
The system SHALL notify about chat messages: the other members of a direct conversation, every other member of a group conversation, every member of a channel for a top-level message, and the author and earlier repliers for a thread reply, skipping anyone who muted that conversation (`CHAT_DIRECT`, `CHAT_MESSAGE`). Users the chat mention rules notify get `CHAT_MENTION` instead. Chat SHALL keep one unread notification per conversation and Telegram one per customer.

#### Scenario: Customer writes several times
- **WHEN** a customer sends three Telegram messages before the responsible manager reads the notification
- **THEN** the manager has one unread `TELEGRAM_MESSAGE` notification for that customer, showing the latest message

#### Scenario: Muted direct conversation
- **WHEN** a user has muted a direct conversation and gets a message there without a mention
- **THEN** no notification is created

#### Scenario: Several messages in a channel
- **WHEN** two messages are posted in «Общий» before Семенець reads their notifications
- **THEN** he has one unread `CHAT_MESSAGE` notification for «Общий», showing the latest message, and their phone shows one pop-up for it

#### Scenario: Reply in a channel thread
- **WHEN** Тимошенко replies in a thread started by Семенець in «Общий»
- **THEN** Семенець is notified and channel members who took no part in the thread are not

#### Scenario: Muted channel with a mention
- **WHEN** a user has muted «Общий» and is mentioned there
- **THEN** they get only the `CHAT_MENTION` notification
