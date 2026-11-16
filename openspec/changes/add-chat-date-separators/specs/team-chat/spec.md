## ADDED Requirements

### Requirement: Day separators in conversations
The web client SHALL split a conversation's and a thread's messages by calendar day in the reader's time zone. Exactly one separator SHALL precede the first shown message of each day, naming the day in the interface language: «Сегодня», «Вчера», the day and month for an earlier day this year, and the day, month and year for an earlier year. Each message SHALL keep its own time, with the full date on hover.

#### Scenario: Messages on different days
- **WHEN** a channel has messages written on 12 November at 13:29 and on 13 November at 08:45, and a reader opens it on 16 November
- **THEN** «12 ноября» appears above the first message and «13 ноября» appears between the two messages

#### Scenario: Today and yesterday
- **WHEN** a reader opens a conversation with a message written yesterday and one written today
- **THEN** «Вчера» appears above the first and «Сегодня» above the second

#### Scenario: An earlier year
- **WHEN** a message was written on 28 December of the previous year
- **THEN** its separator reads «28 декабря» followed by that year

#### Scenario: Several messages on one day
- **WHEN** five messages were written on the same day
- **THEN** exactly one separator appears, above the first of them

#### Scenario: Loading older messages
- **WHEN** a reader scrolls up and older messages of a day already shown at the top are loaded
- **THEN** that day still has exactly one separator, now above its earliest loaded message

#### Scenario: A new message on a new day
- **WHEN** a conversation's newest message is from yesterday and someone posts while the reader has it open
- **THEN** «Сегодня» appears above the new message

#### Scenario: Thread replies
- **WHEN** a thread's root message was written yesterday and its replies today
- **THEN** the thread panel shows «Вчера» above the root message and «Сегодня» above the first reply

#### Scenario: Interface language
- **WHEN** a reader with English as the interface language opens a conversation with messages from today and from 12 November
- **THEN** the separators read «Today» and «12 November»

### Requirement: Current day stays in view
While the reader scrolls through a day's messages, that day's separator SHALL stay visible at the top of the message feed until the next day's separator reaches it.

#### Scenario: Scrolling through a long day
- **WHEN** a reader scrolls through 40 messages written on 12 November
- **THEN** «12 ноября» stays at the top of the feed until the «13 ноября» separator reaches the top and replaces it
