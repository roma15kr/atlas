## ADDED Requirements

### Requirement: Formatted task descriptions
A task description SHALL be formatted text (see `rich-text`) of up to 10,000 characters, edited in the task dialog and shown formatted on the task. Anyone who can edit the task SHALL be able to tick its checklist items in place. Board cards SHALL show the description as a plain-text preview.

#### Scenario: Checklist progress on a task
- **WHEN** an assignee ticks two of three checklist items in the description
- **THEN** both stay ticked for everyone who opens the task

### Requirement: Task comments
Anyone who can see a task SHALL be able to read its comments (oldest first, with author and time) and add comments of 1–5,000 characters of formatted text. A task outside the caller's access SHALL answer 404 `TASK_NOT_FOUND`. Adding a comment SHALL be audited. Deleting a task SHALL delete its comments.

#### Scenario: Assignee comments on a task
- **WHEN** an assignee adds the comment «КП отправлено, **ждём ответа**»
- **THEN** everyone who can open the board sees the comment with the bold text, the author and the time

#### Scenario: Comment on a task the user cannot see
- **WHEN** a user comments on a task on a board they cannot open
- **THEN** the response is 404 `TASK_NOT_FOUND` and nothing is stored
