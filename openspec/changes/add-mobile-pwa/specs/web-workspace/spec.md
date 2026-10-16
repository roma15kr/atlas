## ADDED Requirements

### Requirement: Installable app
The web app SHALL be installable as an app with its own name, icon and full-screen window, through a web app manifest. The profile SHALL offer «Установить приложение» where the browser supports an install prompt, explain the iPhone steps («Поделиться → На экран Домой») where it does not, and say when Atlas already runs as an installed app.

#### Scenario: Android phone
- **WHEN** a user opens Atlas in Chrome on Android and taps «Установить приложение» in «Профиль → Приложение»
- **THEN** Chrome installs Atlas, and it opens full-screen from its own icon

#### Scenario: iPhone
- **WHEN** a user opens «Профиль → Приложение» in Safari on an iPhone
- **THEN** the steps «Поделиться → На экран Домой» are shown, with a note that notifications on iPhone need this

### Requirement: Phone navigation
At or below 640px the workspace SHALL show a bottom bar with «Задачи», «Сообщения», «Telegram», «CRM» and «Ещё», which opens the full menu, with unread counts for messages and Telegram. Wider screens SHALL keep the sidebar without the bottom bar.

#### Scenario: Switching screens on a phone
- **WHEN** a user on a phone taps «Сообщения» in the bottom bar
- **THEN** the chat screen opens and the item is marked as current

### Requirement: Offline screen
When a page of Atlas cannot load because there is no connection, the app SHALL show «Нет подключения к интернету» with «Повторить» instead of the browser's error. The app SHALL NOT store workspace data for offline use, and SHALL NOT intercept API or realtime requests.

#### Scenario: No connection
- **WHEN** an installed Atlas is opened without a connection
- **THEN** it shows «Нет подключения к интернету» and «Повторить», and no tasks, chats or clients
