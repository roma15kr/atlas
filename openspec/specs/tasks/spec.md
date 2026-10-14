# tasks Specification

## Purpose
Organizes work as tasks on department task boards: each board has its own configurable stages, is shared by its department and invited colleagues, and is managed by the department head or a director. Tasks have assignees, priorities and due dates, can link to a CRM deal, and record when they are completed.

## Requirements

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

### Requirement: Deal link
The system SHALL allow a task to link only to a deal visible to the actor, including access to the deal's funnel. When a task is shown to a user who cannot access the linked deal's funnel, the task SHALL be returned without the deal summary.

#### Scenario: Link to invisible deal
- **WHEN** a task is created or updated with a `dealId` outside the actor's scope or in a funnel the actor cannot access
- **THEN** the response is 404 `DEAL_NOT_FOUND`

#### Scenario: Assignee without funnel access
- **WHEN** a MANAGER assigns a task linked to a restricted-funnel deal to an employee without access to that funnel, and the employee lists their tasks
- **THEN** the task is listed with `deal` set to null, and the deal title is not exposed

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

### Requirement: Boards
The system SHALL let a company have task boards. Each board SHALL have:
- a name, 1-100 characters and unique within its department, ignoring case
- an optional owning department
- a sort order
- an ordered list of one or more stages
- an optional set of extra members

A board without a department is a director board.

#### Scenario: Head creates a board
- **WHEN** a MANAGER creates a board named "Запуск продукта" with stages for their own department
- **THEN** the board is created in that department, the response is 201, and `TASK_BOARD_CREATED` is audited

#### Scenario: Board without stages
- **WHEN** a board is created with no stages, or with no stage in category `TODO`
- **THEN** the response is 400 `VALIDATION_ERROR`

#### Scenario: Duplicate board name
- **WHEN** a board is created or renamed to a name already used in the same department, ignoring case
- **THEN** the response is 409 `BOARD_NAME_TAKEN`

### Requirement: Board managers
The system SHALL allow board configuration only to its managers:
- **DIRECTOR:** any board of the company, and boards without a department.
- **MANAGER:** only boards of their own department.

Configuration covers:
- creating, renaming, reordering and deleting boards
- adding, editing, reordering and deleting stages
- replacing the member list

Any other attempt SHALL receive 403 `BOARD_MANAGER_ONLY` and SHALL be audited as `TASK_BOARD_CONFIG_DENIED`.

#### Scenario: Employee edits a stage
- **WHEN** an EMPLOYEE renames a stage of their department's board
- **THEN** the response is 403 `BOARD_MANAGER_ONLY`, nothing changes, and `TASK_BOARD_CONFIG_DENIED` is audited

#### Scenario: Head of another department
- **WHEN** a MANAGER tries to configure a board of another department
- **THEN** the response is 404 `BOARD_NOT_FOUND` if they cannot see it, or 403 `BOARD_MANAGER_ONLY` if they are only a member

#### Scenario: Manager creates a board for another department
- **WHEN** a MANAGER creates a board with another department's id
- **THEN** the response is 403 `BOARD_MANAGER_ONLY`

### Requirement: Stage categories
Each stage SHALL have:
- a name, 1-100 characters and unique within its board, ignoring case
- a color in `#RRGGBB` form
- a position
- a category: `TODO` ("Не начато"), `ACTIVE` ("В работе") or `DONE` ("Готово")

Board managers SHALL be able to add stages, change name, color and category, and set the complete stage order. A board SHALL always keep at least one `TODO` stage and one `DONE` stage.

#### Scenario: Custom workflow
- **WHEN** a head configures the stages "Бэклог" (TODO), "Разработка" (ACTIVE), "Проверка" (ACTIVE) and "Готово" (DONE)
- **THEN** the board shows these four columns in that order

#### Scenario: Removing the last done stage
- **WHEN** an edit or deletion would leave a board without a `DONE` stage or without a `TODO` stage
- **THEN** the response is 400 `STAGE_CATEGORY_REQUIRED` and nothing changes

#### Scenario: Incomplete reorder
- **WHEN** a submitted order is not an exact permutation of the board's stages
- **THEN** the response is 400 `INVALID_STAGE_ORDER`

### Requirement: Stage deletion relocates tasks
The system SHALL delete a stage only together with a target stage of the same board when the stage holds tasks. The tasks SHALL move to the target stage in the same transaction. If the move changes a task's category into or out of `DONE`, its completion time SHALL follow. The deletion SHALL be audited as `TASK_STAGE_DELETED` with the target and the number of moved tasks. A board's last stage SHALL NOT be deletable.

#### Scenario: Delete a stage with tasks
- **WHEN** a head deletes "Проверка" holding 4 tasks and chooses "Готово" as the target
- **THEN** the 4 tasks are in "Готово", marked completed, the stage no longer exists, and one audit event records 4 moved tasks

#### Scenario: Missing target
- **WHEN** a stage holding tasks is deleted without a target
- **THEN** the response is 400 `TARGET_STAGE_REQUIRED`

### Requirement: Board deletion
The system SHALL allow a board manager to delete a board only when it holds no tasks. Deletion SHALL remove its stages and members and SHALL be audited as `TASK_BOARD_DELETED`.

#### Scenario: Board with tasks
- **WHEN** a manager deletes a board that holds tasks
- **THEN** the response is 409 `BOARD_NOT_EMPTY`

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

### Requirement: Board listing
The system SHALL list the boards the caller can open, grouped by department and ordered by sort order. Each board SHALL include:
- its stages in order, with task counts
- whether the caller can manage it
- for board managers, the member list

#### Scenario: Employee lists boards
- **WHEN** an employee lists boards
- **THEN** the boards of their department and the boards they were added to are returned, without member lists

### Requirement: Default boards for existing data
On deployment, the system SHALL give every department a "Задачи отдела" board with stages "Нужно сделать" (TODO), "В работе" (ACTIVE) and "Готово" (DONE). It SHALL move each existing task to its department's board, with status TODO, IN_PROGRESS and DONE mapped to those stages, and keep its assignee, completion time and deal link. Tasks without a department SHALL go to one director board per company, with their assignees as members.

#### Scenario: Upgrade
- **WHEN** the migration runs on a department with tasks in all three statuses
- **THEN** each task appears on "Задачи отдела" in the matching stage with the same assignee and completion time

### Requirement: Formatted task descriptions
A task description SHALL be formatted text (see `rich-text`) of up to 10,000 characters, edited in the task dialog and shown formatted on the task. Anyone who can edit the task SHALL be able to tick its checklist items in place. Board cards SHALL show the description as a plain-text preview.

#### Scenario: Checklist progress on a task
- **WHEN** an assignee ticks two of three checklist items in the description
- **THEN** both stay ticked for everyone who opens the task

### Requirement: Task comments
Anyone who can see a task SHALL be able to read its comments (oldest first, with author and time) and add comments of 1–5,000 characters of formatted text. A task outside the caller's access SHALL answer 404 `TASK_NOT_FOUND`. Adding a comment SHALL be audited. Deleting a task SHALL delete its comments.

#### Scenario: Assignee comments on a task
- **WHEN** an assignee adds the comment «КП отправлено, **ждём ответа**»
- **THEN** everyone who can open the board sees the comment with the bold text, the author and the time

#### Scenario: Comment on a task the user cannot see
- **WHEN** a user comments on a task on a board they cannot open
- **THEN** the response is 404 `TASK_NOT_FOUND` and nothing is stored

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
