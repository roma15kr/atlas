# Spec Delta

## ADDED Requirements

### Requirement: Task metrics definition
Report, dashboard and AI task metrics SHALL count a task once for each of its assignees. A task SHALL count as done when its stage category is `DONE`. It SHALL count as overdue when it is not done and its due date has passed. A team or department report SHALL count each task once.

#### Scenario: Shared task in an employee report
- **WHEN** a task assigned to two employees moves to a `DONE` stage
- **THEN** each employee's report counts it as one done task

#### Scenario: Custom done stage
- **WHEN** a head names a `DONE`-category stage "Сдано клиенту"
- **THEN** tasks in it count as done in reports and on the dashboard
