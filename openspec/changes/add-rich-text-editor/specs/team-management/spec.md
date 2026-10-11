## ADDED Requirements

### Requirement: Formatted job descriptions
A job description SHALL be formatted text (see `rich-text`) of up to 20,000 characters. The job description editor SHALL use the formatting editor, keep its counter and section template, and the Team panel and profile SHALL show the description formatted. Text for AI analysis SHALL stay Markdown.

#### Scenario: Template with headings
- **WHEN** a head inserts the section template into an empty description
- **THEN** the sections appear as headings with bulleted lists, ready to fill
