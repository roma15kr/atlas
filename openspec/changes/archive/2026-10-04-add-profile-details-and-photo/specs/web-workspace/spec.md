# Spec Delta

## ADDED Requirements

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
