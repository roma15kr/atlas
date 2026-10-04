# task-boards Specification

## Purpose
Lets departments organize work on several task boards with their own configurable stages, shared by the department and invited colleagues, and managed by the department head or a director.

## Requirements

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
- **THEN** that employee sees the board and all its tasks

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
