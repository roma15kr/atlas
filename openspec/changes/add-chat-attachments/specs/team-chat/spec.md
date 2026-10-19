## ADDED Requirements

### Requirement: File attachments
A member who may post SHALL be able to attach up to 10 files to a message: PDF, Word, Excel, CSV, PowerPoint, text, ZIP or images, each within the upload limit (20 MB by default). A message MAY consist of files only. Each file SHALL show its name, type and size and download as the original file, only for users who may read that conversation; anyone else SHALL get 404. Uploads SHALL be audited without file names, and other file types SHALL be rejected with 400 `UNSUPPORTED_FILE_TYPE`.

#### Scenario: Sharing a spreadsheet
- **WHEN** Харруд attaches «для склада.xlsx» to a message in «Общий» and sends it
- **THEN** every member sees the file card with its name and size and downloads the original spreadsheet

#### Scenario: Outsider follows a file link
- **WHEN** a user who can't read the conversation requests one of its files
- **THEN** the response is 404

#### Scenario: Unsupported file
- **WHEN** a member attaches a program file (.exe)
- **THEN** it is rejected with a message that this type can't be attached

#### Scenario: Message deleted
- **WHEN** the author deletes a message with attachments
- **THEN** its files can no longer be downloaded
