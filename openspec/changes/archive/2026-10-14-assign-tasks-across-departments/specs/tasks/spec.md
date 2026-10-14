## MODIFIED Requirements

### Requirement: Task records
The system SHALL store tasks with:
- title and description
- board, and stage (a stage of that board)
- priority (LOW, NORMAL, HIGH), position and due date
- optional linked deal
- one or more assignees, and the creator
- the board's department

Every assignee SHALL be an ACTIVE user of the company; they do not need to be able to open the board. Any user who can open a board SHALL be able to:
- see all of its tasks
- create tasks on it and edit them
- move tasks between its stages and to other boards they can open
- set any ACTIVE user of the company as assignees

Only the task's creator and the board's managers SHALL be able to delete a task. When no stage is given, a new task SHALL go to the board's first `TODO` stage, and when no assignee is given, the creator SHALL be the assignee.

#### Scenario: Employee creates a task
- **WHEN** an EMPLOYEE creates a task on their department's board without assignees
- **THEN** the task is placed in the board's first `TODO` stage, assigned to that employee, and `TASK_CREATED` is audited

#### Scenario: Manager assigns a task
- **WHEN** a MANAGER creates a task on a board of their department for two users who can open the board
- **THEN** the task has both users as assignees and the manager as creator

#### Scenario: Assignee without board access
- **WHEN** an employee of «Отдел продаж» creates a task on the sales board and assigns a warehouse employee who cannot open that board
- **THEN** the task is created with that assignee, who can open this task but is not made a board member

#### Scenario: Assignee who can't be assigned
- **WHEN** a task is created or updated with an assignee who is disabled or belongs to another company
- **THEN** the response is 400 `INVALID_ASSIGNEE` and nothing changes

#### Scenario: Colleague's task on a shared board
- **WHEN** an employee opens a task on their department's board that is assigned only to a colleague
- **THEN** the task is returned and the employee may move it to another stage

#### Scenario: Deleting someone else's task
- **WHEN** an employee who is neither the creator nor a board manager deletes a task
- **THEN** the response is 403 `TASK_DELETE_FORBIDDEN`

#### Scenario: Task on an inaccessible board
- **WHEN** a user requests a task on a board they cannot open and they are not one of its assignees, or creates a task on such a board
- **THEN** the response is 404 `TASK_NOT_FOUND` or `BOARD_NOT_FOUND`

### Requirement: Task listing
The system SHALL list tasks on boards the caller can open, plus tasks on other boards where the caller is an assignee, ordered by stage position, task position and due date. The list SHALL be filterable by:
- board and stage
- stage category
- priority
- deal
- assignee, where `assignee=me` means the caller

It SHALL use `limit`/`offset` pagination (default 25, max 100). Each task SHALL include its board id, a stage summary (id, name, color, category) and its assignees.

#### Scenario: Filter by status
- **WHEN** a user lists tasks with `category=DONE`
- **THEN** only tasks in `DONE` stages of boards they can open, or assigned to them, are returned

#### Scenario: My tasks across boards
- **WHEN** a user lists tasks with `assignee=me`
- **THEN** every task where they are an assignee is returned, including tasks on boards they cannot open

## ADDED Requirements

### Requirement: Tasks assigned from outside the board
An assignee who cannot open a task's board SHALL be able to open that task by link and from «Мои задачи», edit its fields, comment on it, and move it between the stages of its board. They SHALL NOT see the board's other tasks, create tasks on the board, delete the task, or move it to another board. When they are removed from the task's assignees, the task SHALL answer them 404 `TASK_NOT_FOUND`.

#### Scenario: Warehouse colleague works on a sales task
- **WHEN** a warehouse employee assigned to a sales task moves it to «В работе» and comments «Отгружено»
- **THEN** the task is in «В работе», the comment is saved, and both are visible to the sales department

#### Scenario: The rest of the board stays private
- **WHEN** that warehouse employee lists tasks of the sales board or opens another sales task
- **THEN** they see only their own task, and the other task answers 404 `TASK_NOT_FOUND`

#### Scenario: Removed from the task
- **WHEN** the sales head removes the warehouse employee from the task's assignees
- **THEN** the task disappears from the employee's «Мои задачи» and answers them 404
