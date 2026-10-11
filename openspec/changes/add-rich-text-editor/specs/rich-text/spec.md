## Purpose

Shared rules for formatted text in Atlas: how people write it, which formatting exists, how it is shown safely, and how images and checklists behave wherever a feature uses formatted text.

## ADDED Requirements

### Requirement: Formatted text editor
Every formatted field SHALL be edited in a what-you-see-is-what-you-get editor that shows formatting while typing, has a toolbar, and supports the shortcuts Ctrl/⌘+B (bold), Ctrl/⌘+I (italic) and Ctrl/⌘+K (link). The text SHALL be saved as Markdown, and the field's existing length limit SHALL apply to that Markdown.

#### Scenario: Bold text from the toolbar
- **WHEN** a user selects a word in a formatted field, presses «Жирный» and saves
- **THEN** the word is shown in bold for everyone who opens the field, and the saved text is `**word**`

#### Scenario: Text over the limit
- **WHEN** the saved Markdown would exceed the field's limit
- **THEN** nothing is saved, the editor shows how far over the limit the text is, and the user's text stays in the editor

### Requirement: Supported formatting
Formatted text SHALL support:
- bold, italic and strikethrough;
- headings (levels 1–3);
- bulleted and numbered lists;
- links (http, https and mailto only);
- quotes, inline code and code blocks;
- checklists;
- tables;
- images uploaded through the editor.

Other Markdown and any raw HTML SHALL be shown as plain text.

#### Scenario: Table
- **WHEN** a user inserts a 3×2 table, fills it and saves
- **THEN** readers see a table with the same cells

#### Scenario: Raw HTML is not executed
- **WHEN** saved text contains `<img src=x onerror=alert(1)>` or a `javascript:` link
- **THEN** readers see the characters as text or a plain word, and no script runs

### Requirement: Safe display
The system SHALL display formatted text only after removing everything outside the supported formatting. Links SHALL open in a new tab without access to Atlas. Images SHALL be shown only from Atlas's own image storage.

#### Scenario: External image
- **WHEN** saved text references an image on another site
- **THEN** readers see the link text instead of the image

### Requirement: Pasted images
A user SHALL be able to paste or drop a PNG, JPEG, GIF or WebP image of up to 5 MB into a formatted field. The image is uploaded and inserted where the cursor is. Other files or larger images SHALL be refused with a message, and the text SHALL stay unchanged.

#### Scenario: Pasting a screenshot
- **WHEN** a user pastes a screenshot into a task description
- **THEN** a placeholder shows while it uploads, then the image appears in the text and is saved with it

#### Scenario: Unsupported file
- **WHEN** a user drops a 12 MB image or a PDF into the editor
- **THEN** a message explains that only images up to 5 MB can be added, and nothing is inserted

### Requirement: Image access
An uploaded image SHALL be served only to signed-in users of the same company, through an address that cannot be guessed. Uploads SHALL be counted per user and limited to 60 per hour.

#### Scenario: Image from another company
- **WHEN** a signed-in user of another company requests an image address
- **THEN** the response is 404

### Requirement: Interactive checklists
Where the viewer may edit a formatted field, ticking or unticking a checklist item in the formatted view SHALL save that change immediately, without opening the editor. Where they may not edit it, the checkboxes SHALL be shown but disabled.

#### Scenario: Ticking an item in a task
- **WHEN** an assignee ticks «Отправить КП» in a task description
- **THEN** the item stays ticked after reload, and the rest of the description is unchanged

#### Scenario: Read-only checklist
- **WHEN** a user views a chat message that contains a checklist
- **THEN** the checkboxes are shown but cannot be changed

### Requirement: Plain-text previews
Where formatted text is shortened to one line (conversation lists, notifications, card previews), the system SHALL show it as plain text: formatting marks removed, images shown as «[изображение]», and tables shown as cell text.

#### Scenario: Conversation preview
- **WHEN** the last chat message is `**Итог:** - [x] КП`
- **THEN** the conversation list shows «Итог: КП»
