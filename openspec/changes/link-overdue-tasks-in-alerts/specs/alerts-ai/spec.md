## ADDED Requirements

### Requirement: Overdue tasks in an alert
An overdue-tasks alert SHALL include the overdue tasks it is about, oldest due date first and at most ten: each with its title, board and due date, and a link that opens the task. It SHALL include only tasks the viewer can open and that are not done, and SHALL say how many more overdue tasks there are beyond those shown.

#### Scenario: Director opens an overdue task from the signal
- **WHEN** the director expands «Просроченные задачи» for Харруд Хишам with five overdue tasks and clicks the first one
- **THEN** the five tasks are listed with their boards and due dates, and the first task opens

#### Scenario: Task finished in the meantime
- **WHEN** one of the listed tasks is moved to a done stage before the next automation run
- **THEN** the alert no longer lists it

#### Scenario: Task the viewer cannot see
- **WHEN** a head views an alert whose tasks include a personal task outside their oversight
- **THEN** that task is not listed and is counted in «и ещё N»
