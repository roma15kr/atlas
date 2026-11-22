## ADDED Requirements

### Requirement: Who may change the appearance
Only a director SHALL change the company's appearance (title, logo, colours, reset). Every signed-in person and the login screen SHALL see the current appearance. An attempt by a manager or employee to change it SHALL be refused, and both successful changes and refused attempts SHALL be recorded in the audit log by field name, without the values.

#### Scenario: A director changes the title
- **WHEN** a director saves the title «RDIM Office»
- **THEN** the title is stored for the company and the audit log records an appearance change naming the field «title»

#### Scenario: A manager tries to change the colours
- **WHEN** a manager sends a request to change the accent colour
- **THEN** the request is refused with 403, nothing changes, and the refused attempt is audited

#### Scenario: The screen is hidden from others
- **WHEN** a manager or an employee looks at the navigation or opens the «Оформлення» address directly
- **THEN** there is no «Оформлення» item, and the address leads back to the dashboard

### Requirement: Appearance screen
A director SHALL find «Оформлення» in the navigation. It SHALL open a settings screen of read-only cards: «Назва і логотип», «Кольори», a preview of the sidebar, a primary button and a link, and «Повернути стандартне оформлення». All changes SHALL be made through dialogs.

#### Scenario: Opening the screen
- **WHEN** a director opens «Оформлення» on a company that never changed its appearance
- **THEN** the title reads «Atlas», no logo is set, and the colours are the standard accent #176f68 and sidebar #1d2a28

#### Scenario: Card actions
- **WHEN** a director looks at the cards of a company with a logo
- **THEN** «Назва і логотип» offers «Змінити назву», «Завантажити логотип» and «Прибрати логотип», and «Кольори» shows both colours with their codes and offers «Змінити кольори»

### Requirement: Title
The title SHALL be 1–30 characters after trimming spaces and SHALL replace «Atlas» wherever the app names itself (see «Where the branding appears»). Texts inside messages, documents and other user content SHALL NOT change.

#### Scenario: An empty title is refused
- **WHEN** a director saves a title made only of spaces
- **THEN** the dialog shows «Вкажіть назву від 1 до 30 символів» and the title doesn't change

### Requirement: Logo
A director SHALL upload a logo as a PNG, JPEG or WebP image of up to 5 MB. The browser SHALL fit it into a square without cropping, on a transparent or white background. From it the app SHALL make the sidebar mark, the browser tab icon and the installed app's icons. Other file types, including SVG, SHALL be refused. Removing the logo SHALL bring back the letter mark: the first letter of the title on the accent colour.

#### Scenario: Uploading a wide logo
- **WHEN** a director uploads a 1200×300 PNG logo
- **THEN** the whole logo is visible, centred in the square mark, and the sidebar, browser tab and installed-app icons use it

#### Scenario: An SVG file is refused
- **WHEN** a director chooses an SVG file
- **THEN** the dialog says only PNG, JPEG or WebP up to 5 MB can be used, and nothing is uploaded

#### Scenario: No logo
- **WHEN** a director removes the logo of a company titled «RDIM Office»
- **THEN** the sidebar mark shows «R» on the accent colour

### Requirement: Colours
A director SHALL choose an accent colour and a sidebar colour, from eight ready-made pairs or any colour by code, and see a live preview before saving. Hover and tint shades of the accent SHALL be derived from it. Status colours (red, amber, green, blue) SHALL stay fixed.

#### Scenario: Status colours stay fixed
- **WHEN** a director changes the accent to #3949ab
- **THEN** buttons, links and active items use #3949ab, while overdue badges stay red and success badges stay green

### Requirement: Readable colours
The accent colour SHALL give white text a contrast of at least 4.5:1, and every ready-made pair SHALL pass. A lighter accent SHALL be refused with an explanation. The sidebar's text SHALL switch between light and dark, whichever reads better on the chosen sidebar colour.

#### Scenario: A too-light accent is refused
- **WHEN** a director enters the accent #f5d90a
- **THEN** the preview marks it as hard to read, «Зберегти» is unavailable, and the dialog explains that white text on this colour is hard to read

#### Scenario: A light sidebar
- **WHEN** a director saves the sidebar colour #f1f3f2
- **THEN** the sidebar shows dark text and icons on it

### Requirement: Reset
«Повернути стандартне оформлення» SHALL, after confirmation, set the title back to «Atlas», remove the logo and restore the standard colours, and SHALL be audited.

#### Scenario: Resetting
- **WHEN** a director confirms the reset
- **THEN** everyone sees «Atlas», the letter mark and the standard teal colours again

### Requirement: Where the branding appears
The title, logo and colours SHALL appear wherever the app presents itself: the sidebar and phone header, the login screen before sign-in, the browser tab, the installed app, and pop-up notifications. When there is no saved branding, the standard Atlas look SHALL be used everywhere.

#### Scenario: The login screen before sign-in
- **WHEN** someone opens the login screen of a company titled «RDIM Office» with a logo
- **THEN** the screen shows that logo and title, and the accent colour on its button

#### Scenario: The browser tab
- **WHEN** a person of a company titled «RDIM Office» with a logo opens «Задачі»
- **THEN** the tab reads «Задачі · RDIM Office» and shows the logo as its icon

#### Scenario: Installing the app after a change
- **WHEN** a person installs the app on a phone after the director set the title «RDIM Office» and a logo
- **THEN** the home screen shows «RDIM Office» with an icon made from the logo, and the app's window uses the accent colour

#### Scenario: The test notification
- **WHEN** a person presses «Перевірити» in notification settings of a company titled «RDIM Office»
- **THEN** the pop-up's title names «RDIM Office», not «Atlas», and shows the logo icon

#### Scenario: An alert that names the app
- **WHEN** an inactivity alert is raised in a company titled «RDIM Office»
- **THEN** its text says there was no activity in «RDIM Office»

### Requirement: Changes apply live
A saved change SHALL reach everyone who has the app open within a few seconds, without reloading. A browser that was offline SHALL show the current appearance the next time it loads. Installed apps MAY keep their old name and icon until the phone or computer refreshes them.

#### Scenario: A colleague sees the new colour
- **WHEN** the director saves a new accent colour while an employee has the task board open
- **THEN** the employee's buttons and active items switch to the new colour within a few seconds, without a reload
