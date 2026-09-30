# Spec Delta

## MODIFIED Requirements

### Requirement: Task records
The system SHALL store tasks with:
- title and description
- board, and stage (a stage of that board)
- priority (LOW, NORMAL, HIGH), position and due date
- optional linked deal
- one or more assignees, and the creator
- the board's department

Every assignee SHALL be an ACTIVE user who can open the board. Any user who can open a board SHALL be able to:
- see all of its tasks
- create tasks on it and edit them
- move tasks between its stages and to other boards they can open
- set any of the board's users as assignees

Only the task's creator and the board's managers SHALL be able to delete a task. When no stage is given, a new task SHALL go to the board's first `TODO` stage, and when no assignee is given, the creator SHALL be the assignee.

#### Scenario: Employee creates a task
- **WHEN** an EMPLOYEE creates a task on their department's board without assignees
- **THEN** the task is placed in the board's first `TODO` stage, assigned to that employee, and `TASK_CREATED` is audited

#### Scenario: Manager assigns a task
- **WHEN** a MANAGER creates a task on a board of their department for two users who can open the board
- **THEN** the task has both users as assignees and the manager as creator

#### Scenario: Assignee without board access
- **WHEN** a task is created or updated with an assignee who cannot open the board
- **THEN** the response is 403 `ASSIGNEE_BOARD_ACCESS_REQUIRED`

#### Scenario: Colleague's task on a shared board
- **WHEN** an employee opens a task on their department's board that is assigned only to a colleague
- **THEN** the task is returned and the employee may move it to another stage

#### Scenario: Deleting someone else's task
- **WHEN** an employee who is neither the creator nor a board manager deletes a task
- **THEN** the response is 403 `TASK_DELETE_FORBIDDEN`

#### Scenario: Task on an inaccessible board
- **WHEN** a user requests or creates a task on a board they cannot open
- **THEN** the response is 404 `TASK_NOT_FOUND` or `BOARD_NOT_FOUND`

### Requirement: Completion timestamp
The system SHALL set `completed_at` when a task is created in, or moved into, a stage whose category is `DONE`. It SHALL clear `completed_at` when the task moves to a stage of another category, and SHALL leave it unchanged when the task moves between two `DONE` stages or is saved without a stage change.

#### Scenario: Move to done
- **WHEN** a task moves from an `ACTIVE` stage to a `DONE` stage
- **THEN** `completedAt` is set to the current time

#### Scenario: Reopen
- **WHEN** a task in a `DONE` stage moves to an `ACTIVE` stage
- **THEN** `completedAt` becomes null

#### Scenario: Same column
- **WHEN** a task already in a `DONE` stage is saved or dropped into the same stage
- **THEN** `completedAt` keeps its original value

### Requirement: Task listing
The system SHALL list tasks on boards the caller can open, ordered by stage position, task position and due date. The list SHALL be filterable by:
- board and stage
- stage category
- priority
- deal
- assignee, where `assignee=me` means the caller

It SHALL use `limit`/`offset` pagination (default 25, max 100). Each task SHALL include its board id, a stage summary (id, name, color, category) and its assignees.

#### Scenario: Filter by status
- **WHEN** a user lists tasks with `category=DONE`
- **THEN** only tasks in `DONE` stages of boards they can open are returned

#### Scenario: My tasks across boards
- **WHEN** a user lists tasks with `assignee=me`
- **THEN** every task on any board they can open where they are an assignee is returned
