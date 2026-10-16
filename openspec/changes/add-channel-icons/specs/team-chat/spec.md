## ADDED Requirements

### Requirement: Channel icon
A channel admin or a DIRECTOR SHALL be able to give a channel a library icon on a palette colour or an emoji, both searchable in Russian, or clear it. It SHALL replace the channel's «#» or lock tile wherever the channel is shown. Values outside the libraries SHALL get 400 `CHAT_INVALID_ICON`. Changes SHALL be audited with ids only and reach open screens live; others SHALL get 403 `CHAT_FORBIDDEN`, audited.

#### Scenario: Admin picks an icon
- **WHEN** the admin of «Общий» picks the red colour, types «мег» and chooses «Мегафон»
- **THEN** every member sees a white megaphone on red instead of «#» next to «Общий» in the chat list and in the channel header

#### Scenario: Admin picks an emoji
- **WHEN** an admin opens «Эмодзи» in the picker and chooses 🚀 for «Маркетинг»
- **THEN** «Маркетинг» shows 🚀 in the chat list and the header

#### Scenario: Member without admin rights
- **WHEN** a member who is not an admin of the channel tries to change its icon
- **THEN** the response is 403 `CHAT_FORBIDDEN` and the attempt is audited

#### Scenario: Icon cleared
- **WHEN** an admin chooses «Убрать иконку»
- **THEN** the channel shows «#» again
