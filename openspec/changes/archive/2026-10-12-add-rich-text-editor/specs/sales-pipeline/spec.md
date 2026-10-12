## ADDED Requirements

### Requirement: Deal notes
Every deal SHALL have optional notes of up to 10,000 characters of formatted text (see `rich-text`). The notes SHALL follow the deal's access: whoever may see the deal sees them, and whoever may edit the deal edits them and may tick their checklist items in place. Changing the notes SHALL be audited with the field name only.

#### Scenario: Adding notes to a deal
- **WHEN** the deal owner writes notes with the agreed terms as a list and saves
- **THEN** the deal shows the formatted notes to everyone who can see the deal

#### Scenario: Deal out of scope
- **WHEN** a user updates the notes of a deal outside their scope
- **THEN** the response is 404 and nothing changes
