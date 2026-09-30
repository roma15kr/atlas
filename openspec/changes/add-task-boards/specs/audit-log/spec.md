# Spec Delta

## ADDED Requirements

### Requirement: Task board configuration audit
The system SHALL audit:
- `TASK_BOARD_CREATED`, `TASK_BOARD_UPDATED` and `TASK_BOARD_DELETED`
- `TASK_BOARD_MEMBERS_UPDATED`, with the previous and new members
- `TASK_STAGE_CREATED`, `TASK_STAGE_UPDATED` and `TASK_STAGES_REORDERED`
- `TASK_STAGE_DELETED`, with the target stage and the number of moved tasks
- `TASK_BOARD_CONFIG_DENIED`, with the attempted operation

Each event SHALL carry the board's department, so a department head sees their own boards' events in the audit screen.

#### Scenario: Denied board configuration
- **WHEN** an employee tries to add a stage to a board
- **THEN** a `TASK_BOARD_CONFIG_DENIED` event with operation `STAGE_CREATE` and the board's department is written
