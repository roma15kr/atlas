## ADDED Requirements

### Requirement: Channel icon
A channel admin or a DIRECTOR SHALL be able to set a PNG, JPEG or WebP image of up to 2 MB as a channel's icon, and to remove it. The icon SHALL replace the channel's «#» or lock tile wherever the channel is listed or opened, as a rounded square. It SHALL be served only to signed-in users of the same company. Changes SHALL be audited with ids only, and reach open screens live; attempts by others SHALL return 403 `CHAT_FORBIDDEN` and be audited.

#### Scenario: Admin sets an icon
- **WHEN** the admin of «Общий» uploads a logo in «Настройки канала»
- **THEN** every member sees the logo instead of «#» next to «Общий» in the chat list and in the channel header

#### Scenario: Member without admin rights
- **WHEN** a member who is not an admin of the channel tries to change its icon
- **THEN** the response is 403 `CHAT_FORBIDDEN` and the attempt is audited

#### Scenario: Icon removed
- **WHEN** an admin removes the icon
- **THEN** the channel shows «#» again
