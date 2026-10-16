## ADDED Requirements

### Requirement: Channel icon
A channel admin or a DIRECTOR SHALL be able to choose a channel's icon from Atlas's built-in icon library, searchable by Russian names, or clear it. The chosen icon SHALL replace the channel's «#» or lock tile wherever the channel is listed or opened. An icon outside the library SHALL be rejected with 400 `CHAT_INVALID_ICON`. Changes SHALL be audited with ids only and reach open screens live; attempts by others SHALL return 403 `CHAT_FORBIDDEN` and be audited.

#### Scenario: Admin picks an icon
- **WHEN** the admin of «Общий» types «мег» in the icon picker and chooses «Мегафон»
- **THEN** every member sees a megaphone instead of «#» next to «Общий» in the chat list and in the channel header

#### Scenario: Member without admin rights
- **WHEN** a member who is not an admin of the channel tries to change its icon
- **THEN** the response is 403 `CHAT_FORBIDDEN` and the attempt is audited

#### Scenario: Icon cleared
- **WHEN** an admin chooses «Без иконки»
- **THEN** the channel shows «#» again
