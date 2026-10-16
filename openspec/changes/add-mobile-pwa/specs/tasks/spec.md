## ADDED Requirements

### Requirement: «Мои задачи» on a phone
At or below 640px, «Мои задачи» SHALL show one status column at a time, chosen with the tabs «Не начато», «В работе» and «Готово», instead of a board that scrolls sideways. Each card SHALL keep its status select for moving the task.

#### Scenario: Checking what is in progress
- **WHEN** an employee on a phone taps «В работе» in «Мои задачи»
- **THEN** only their tasks in progress are listed, one under another
