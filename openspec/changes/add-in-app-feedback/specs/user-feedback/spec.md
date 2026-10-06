# Spec Delta

## ADDED Requirements

### Requirement: Report from any screen
The web app SHALL offer a "Сообщить о проблеме" control on every screen available to a signed-in user, including the forced password-change screen. It opens a form with:
- a kind: problem, complaint or idea, with problem as the default;
- a description of 10 to 5,000 characters, in any language.

The report SHALL record the page it was sent from. A user SHALL be able to send at most 10 reports per hour; further attempts are refused with a message to try later.

#### Scenario: Employee reports a broken button
- **WHEN** an employee on the deal board clicks "Сообщить о проблеме", writes "Кнопка «Зберегти» нічого не робить" and sends it
- **THEN** the report is saved with kind problem and the page `/sales`, and the employee sees a confirmation with a link to "Мои обращения"

#### Scenario: Description too short
- **WHEN** the description has fewer than 10 characters
- **THEN** the form shows "Опишите проблему подробнее" and nothing is sent

#### Scenario: Too many reports
- **WHEN** a user sends an 11th report within one hour
- **THEN** the report is refused with "Слишком много обращений, попробуйте позже"

### Requirement: Automatic screenshot
When the form opens, the web app SHALL capture an image of the current screen as it was before the form appeared.
- The image SHALL show the page, not the form.
- Password fields SHALL be blank in it.

The form SHALL show a preview, and the user SHALL be able to leave the screenshot out. If capture fails, the form SHALL still work and say that no screenshot is attached. A stored screenshot SHALL be at most 3 MB, in PNG, JPEG or WebP, checked by its content.

#### Scenario: Screenshot attached by default
- **WHEN** a user opens the form on the CRM list
- **THEN** a preview of the CRM list is shown, and sending the report stores that image with it

#### Scenario: User removes the screenshot
- **WHEN** the user clicks "Не прикладывать снимок" and sends
- **THEN** the report is stored without an image

#### Scenario: Capture not possible
- **WHEN** the browser can't produce an image
- **THEN** the form shows "Снимок экрана не удалось сделать" and the report can still be sent

### Requirement: Diagnostic log
A report SHALL include, unless the user leaves it out, a diagnostic log covering the last 15 minutes or 100 events, whichever is smaller:
- errors the web app raised;
- requests to the API, each with its method, path without the query string, status, duration and request identifier;
- page changes;
- realtime connection changes;
- the app version, browser, screen size, language, time zone and online state.

The log SHALL NOT contain request or response bodies, typed text, form values, tokens, cookies or query strings. The form SHALL show a plain-language summary of what is included. A stored log SHALL be at most 64 KB.

#### Scenario: Failed request is in the log
- **WHEN** a save failed with status 500 shortly before the report
- **THEN** the log contains that request's method, path, status 500 and its request identifier, and no request body

#### Scenario: User leaves the log out
- **WHEN** the user unticks "Приложить технический журнал"
- **THEN** the report is stored with only the app version and the page

### Requirement: Report visibility
- A reporter SHALL see their own reports in "Мои обращения": the kind, the beginning of the text, the date, a status, and the issue number once one exists. They see their own screenshot but not anyone else's report.
- A DIRECTOR SHALL see every report of the company: original text, screenshot, log, reporter, page, translation, status and issue link.
- A MANAGER SHALL NOT see other people's reports.
- A report outside the caller's visibility SHALL answer 404.

#### Scenario: Employee opens someone else's report
- **WHEN** an employee requests a colleague's report
- **THEN** the response is 404

#### Scenario: Director reviews a report
- **WHEN** a director opens a report in the inbox
- **THEN** they see the original text, the screenshot, the log and the English translation side by side

### Requirement: Translation and summary
For each report the system SHALL produce, without waiting for a person:
- the detected language;
- an English title of at most 80 characters;
- a 2–4 sentence English summary;
- an anonymised English translation of the full text;
- the steps to reproduce when the text gives them;
- a category: bug, complaint, idea or question;
- a severity: low, medium, high or critical;
- the product area, chosen from the Atlas capabilities.

Names of people and companies, email addresses, phone numbers, amounts and record contents SHALL be replaced with neutral placeholders such as "[person]" or "[client]". The original text SHALL stay unchanged in Atlas.

#### Scenario: Ukrainian complaint
- **WHEN** a report says "Олена Петренко не бачить угоду клієнта ТОВ Ромашка, телефон 067 123 45 67"
- **THEN** the language is Ukrainian; the translation reads "[person] cannot see a deal of client [client], phone [phone]"; no name, company or phone number appears in the title, summary or translation; and the original text is unchanged

### Requirement: GitHub issue creation
For each translated report, the system SHALL create one GitHub issue, without any approval step in Atlas; moderation happens on GitHub, in the configured repository. The issue SHALL have:
- a title prefixed with the category;
- a body with the summary, the anonymised translation, the steps to reproduce, the page, the app version, the browser and an Atlas report reference;
- the labels `feedback`, the category, `severity:<level>` and `area:<area>`.

The issue SHALL NOT contain:
- the screenshot, the diagnostic log or the original text;
- the reporter's name or contact details;
- record names or contents.

Before it is created, the issue text SHALL be checked once more for email addresses and phone numbers, and any found SHALL be replaced. The report SHALL keep the issue number and link.

#### Scenario: Bug becomes an issue
- **WHEN** a report is classified as a bug of high severity in the sales area
- **THEN** an issue titled "[Bug] …" with the labels feedback, bug, severity:high and area:sales-pipeline is created, and the report shows its number

#### Scenario: Personal data slipped through
- **WHEN** the generated summary still contains "anna@example.com"
- **THEN** the issue shows "[email]" instead

### Requirement: Processing without configuration and retries
- Without the GitHub and translation-service credentials configured, reports SHALL be stored with the status "Ожидает обработки", and the director inbox SHALL say what is missing.
- Once both are configured, waiting reports SHALL be processed automatically.
- A failure SHALL be retried at most 5 times with growing delays. After that the report SHALL be marked failed with the reason, and a director SHALL be able to retry it.
- No report SHALL produce more than one issue.

#### Scenario: Credentials added later
- **WHEN** reports were sent while GitHub wasn't configured, and the credentials are then added
- **THEN** each waiting report gets one issue at the next processing run

#### Scenario: Director retries a failed report
- **WHEN** a report failed 5 times because GitHub was unreachable, and a director clicks "Обработать заново"
- **THEN** it is processed again and gets exactly one issue
