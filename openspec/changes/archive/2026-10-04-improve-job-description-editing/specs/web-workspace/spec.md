# Spec Delta

## ADDED Requirements

### Requirement: Job description editor
The Team panel SHALL always show the member's "Должностная инструкция" card. People who may edit the member SHALL see "Заполнить" or "Изменить", which opens a dedicated editor with a 20,000-character counter, an insertable section template and a note that AI recommendations use the text. The team list SHALL mark members the viewer manages who have no description. The profile SHALL show the person their own description, or a note that their manager fills it in.

#### Scenario: Head fills in a missing description
- **WHEN** a head opens an employee marked "Нет инструкции", clicks "Заполнить", inserts the template, edits it and saves
- **THEN** the card shows the text and the badge disappears

#### Scenario: Employee views their profile
- **WHEN** an employee without a description opens the profile
- **THEN** they see "Не заполнена — заполняет руководитель" and no edit control
