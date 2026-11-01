## ADDED Requirements

### Requirement: Interface languages
Atlas SHALL offer its interface in Ukrainian, Russian and English, with Ukrainian as the default. Each user SHALL be able to choose their language in the profile, listed by each language's own name. The choice SHALL be stored on their account, apply at once without reloading, and follow them to every device they sign in from. Changing it SHALL be audited with the field name only.

#### Scenario: Switching to English
- **WHEN** a user picks English in «Профиль»
- **THEN** the menu, the open screen and its buttons change to English at once, and stay English after signing in on a phone

#### Scenario: New user
- **WHEN** a colleague signs in for the first time
- **THEN** Atlas is in Ukrainian

### Requirement: Language before sign-in
Before sign-in, the login and offline screens SHALL use the language last used in that browser, otherwise the browser's preferred language if it is Ukrainian, Russian or English, otherwise Ukrainian, and SHALL offer a language switch.

#### Scenario: English browser
- **WHEN** someone opens the login screen in a browser set to English, never having used Atlas there
- **THEN** the login screen is in English

### Requirement: Localized formatting
Dates, times, relative times, numbers and money SHALL be formatted for the user's language. Money SHALL stay in hryvnia. Counted words SHALL use that language's plural forms.

#### Scenario: Counts in each language
- **WHEN** a board shows 3 tasks
- **THEN** it reads «3 задачі» in Ukrainian, «3 задачи» in Russian and «3 tasks» in English

### Requirement: Server texts in the reader's language
Notifications on the bell, phone and desktop pop-ups, task reminders, AI signals and AI analysis answers SHALL be written in the language of the person who reads them. When one event reaches several people, each SHALL get their own language. Error messages SHALL be shown in the user's language.

#### Scenario: Two languages, one comment
- **WHEN** a colleague comments on a task whose assignees use Ukrainian and English
- **THEN** one assignee's notification and pop-up are in Ukrainian and the other's in English

### Requirement: User content is not translated
Text people write or name SHALL appear as written in every language. That covers messages, comments, notes, client and deal data, and the names of boards, stages, funnels, channels and departments.

#### Scenario: Channel name
- **WHEN** an English-speaking user opens the chat
- **THEN** the channel «Общий» is still called «Общий»
