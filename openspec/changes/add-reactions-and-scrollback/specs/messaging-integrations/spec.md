## ADDED Requirements

### Requirement: Telegram conversation history
A Telegram conversation SHALL open on its newest messages and SHALL load earlier messages page by page as the user scrolls up, keeping the messages on screen in place, until the first message, after which «Начало переписки» is shown. A new message SHALL scroll the view to the end only when the user was already at the end; otherwise a «Новые сообщения ↓» button SHALL appear.

#### Scenario: A long customer history
- **WHEN** a manager opens a customer with 120 messages and scrolls up
- **THEN** all 120 messages become visible, page by page, ending with «Начало переписки»
