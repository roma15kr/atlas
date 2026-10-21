## ADDED Requirements

### Requirement: Task comment attachments
Anyone who can comment on a task SHALL be able to attach up to 10 files to a comment, with the same types and size limit as chat attachments, and a comment MAY consist of files only. The files SHALL download as the originals for everyone who can see the task, and answer 404 to anyone else. Deleting the task SHALL delete its files. Uploads SHALL be audited without file names.

#### Scenario: Attaching a price list to a task
- **WHEN** an assignee attaches «прайс.xlsx» to a comment on a task and posts it
- **THEN** everyone who can open the task sees the file card in the comment and downloads the original spreadsheet

#### Scenario: Assignee from another department
- **WHEN** a colleague from another department, assigned only to that task, opens the comment
- **THEN** they can download the file

#### Scenario: User who can't see the task
- **WHEN** a user who can't see the task requests one of its files
- **THEN** the response is 404
