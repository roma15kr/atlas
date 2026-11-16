## ADDED Requirements

### Requirement: Day separators in customer conversations
The web client SHALL split a Telegram customer conversation's messages, incoming and outgoing, by calendar day in the reader's own time zone, with the same separators as team chat conversations: exactly one before the first shown message of each day, reading «Сегодня», «Вчера», the day and month, or the day, month and year for an earlier year, in the interface language, and staying visible at the top of the feed while the reader scrolls through that day.

#### Scenario: Customer conversation across days
- **WHEN** a customer wrote yesterday and a manager replied today
- **THEN** «Вчера» appears above the customer's message and «Сегодня» above the reply

#### Scenario: Loading older customer messages
- **WHEN** a reader scrolls up and older messages of a day already shown are loaded
- **THEN** that day still has exactly one separator
