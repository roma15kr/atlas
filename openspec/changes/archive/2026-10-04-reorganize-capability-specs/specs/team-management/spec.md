# Spec Delta

## ADDED Requirements

### Requirement: Honest profile screen
The profile screen SHALL save only through the API and SHALL NOT show controls for settings that Atlas does not implement.

#### Scenario: Saving the profile
- **WHEN** a user changes their full name and clicks "Сохранить"
- **THEN** `PATCH /api/v1/team/me` is called, the sidebar shows the new name, and a server error is shown if the save fails

### Requirement: Editable personal profile
The profile screen SHALL let the user upload, replace and remove a photo and edit their date of birth, phone, contact email, city, "about" text and birthday visibility. It SHALL send only the changed fields and show Russian validation messages.
- Before upload, the browser SHALL crop the photo to a square and re-encode it at 512×512, which removes camera metadata.

#### Scenario: Uploading a photo
- **WHEN** a user picks a 4000×3000 phone photo
- **THEN** a 512×512 JPEG is uploaded and the new photo appears in the profile and in the sidebar without a reload

#### Scenario: Invalid email
- **WHEN** the user enters "anna@" as the contact email and saves
- **THEN** no request is sent and the field shows "Укажите корректный email"

### Requirement: Photos and contacts across the workspace
The web app SHALL show a member's photo wherever it shows their avatar, falling back to initials when there is no photo or it fails to load. The Team panel SHALL show the member's phone, contact email, city, visible birthday (day and month) and "about" text.

#### Scenario: Photo fails to load
- **WHEN** a photo URL returns 404
- **THEN** the avatar shows the person's initials

### Requirement: Job description editor
The Team panel SHALL always show the member's "Должностная инструкция" card. People who may edit the member SHALL see "Заполнить" or "Изменить", which opens a dedicated editor with a 20,000-character counter, an insertable section template and a note that AI recommendations use the text. The team list SHALL mark members the viewer manages who have no description. The profile SHALL show the person their own description, or a note that their manager fills it in.

#### Scenario: Head fills in a missing description
- **WHEN** a head opens an employee marked "Нет инструкции", clicks "Заполнить", inserts the template, edits it and saves
- **THEN** the card shows the text and the badge disappears

#### Scenario: Employee views their profile
- **WHEN** an employee without a description opens the profile
- **THEN** they see "Не заполнена — заполняет руководитель" and no edit control
