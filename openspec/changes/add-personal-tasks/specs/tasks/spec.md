## MODIFIED Requirements

### Requirement: Task listing
The system SHALL list the tasks the caller may see (see «Personal tasks»): shared tasks on boards the caller can open, tasks where the caller is an assignee or the author, and personal tasks the caller oversees, ordered by stage position, task position and due date. The list SHALL be filterable by:
- board and stage
- stage category
- priority
- deal
- assignee, where `assignee=me` means the caller
- visibility: `board` for shared tasks, `personal` for personal ones

It SHALL use `limit`/`offset` pagination (default 25, max 100). Each task SHALL include its board id, a stage summary (id, name, color, category) and its assignees.

#### Scenario: Filter by status
- **WHEN** a user lists tasks with `category=DONE`
- **THEN** only `DONE` tasks they may see are returned

#### Scenario: My tasks across boards
- **WHEN** a user lists tasks with `assignee=me`
- **THEN** every task where they are an assignee is returned, including tasks on boards they cannot open

### Requirement: Board access
A user SHALL be able to open a board when any of these hold:
- they are a DIRECTOR of the company
- the board belongs to their department
- they are one of its extra members

Board managers SHALL be able to replace the extra member list with ACTIVE users of the company. The change SHALL be audited as `TASK_BOARD_MEMBERS_UPDATED` with the previous and new members. A board that is inaccessible SHALL behave as not found.

#### Scenario: Cross-department member
- **WHEN** a head adds an employee of another department as a member
- **THEN** that employee sees the board and all its shared tasks

#### Scenario: Outsider
- **WHEN** an employee of another department who is not a member requests the board
- **THEN** the response is 404 `BOARD_NOT_FOUND`

#### Scenario: Director board
- **WHEN** a director creates a board without a department and adds two members
- **THEN** only directors and those two members can open it

## ADDED Requirements

### Requirement: Personal tasks
Every task SHALL be either shared on its board or personal (`onBoard: false`). A shared task SHALL be visible as before. A personal task SHALL be visible only to its author, its assignees, directors, and heads whose scope covers the author's or an assignee's department (including through a parent department); it SHALL answer anyone else 404 `TASK_NOT_FOUND` and SHALL NOT count in their dashboard. Existing tasks SHALL stay shared.

#### Scenario: Head's own task
- **WHEN** the head of «Департамент продаж» creates a task assigned only to herself
- **THEN** it is personal, she sees it in «Мои задачи», and a manager of «Отдел продаж» gets 404 for it and doesn't see it on the board

#### Scenario: Head sees a manager's personal task
- **WHEN** a manager of «Отдел продаж» creates a task only for himself
- **THEN** it is personal, and the head of «Департамент продаж» and the director see it while another manager does not

#### Scenario: Assigning a colleague shares the task
- **WHEN** a head creates a task assigned to a manager, without choosing
- **THEN** it is on the board, and the other managers of that department see it

### Requirement: Board placement switch
Task create and update SHALL accept `onBoard`. When it is omitted on create, the task SHALL be shared if any assignee is neither the author nor a director, and personal otherwise. When an update adds such an assignee without `onBoard`, the task SHALL become shared; it SHALL never become personal implicitly. An assignee from outside the board SHALL NOT change `onBoard` (403 `TASK_OUTSIDER_FORBIDDEN`).

#### Scenario: Turned on by assigning
- **WHEN** an employee adds a colleague to their personal task
- **THEN** the task becomes shared on the board

#### Scenario: Kept personal on purpose
- **WHEN** a head creates a task for a manager with `onBoard: false`
- **THEN** only she, that manager, their heads and directors see it

### Requirement: Personal tasks on screens
The task dialog SHALL show «Показать на доске», following the automatic default until the user changes it. Cards of personal tasks SHALL carry a «Личная» mark. Heads and directors SHALL be able to filter a board to «Личные задачи команды».

#### Scenario: Task for yourself
- **WHEN** an employee creates a task without other assignees
- **THEN** «Показать на доске» is off, and the card shows «Личная» in «Мои задачи»

#### Scenario: Head's filter
- **WHEN** a head chooses «Личные задачи команды» on her department's board
- **THEN** only her team's personal tasks are shown
