# tasks Specification

## Purpose
Gives every user a personal three-column task board (TODO, IN_PROGRESS, DONE), lets managers assign work within their department, and links tasks to CRM deals.

## Requirements

### Requirement: Task records
The system SHALL store tasks with title, description, status (TODO, IN_PROGRESS, DONE), priority (LOW, NORMAL, HIGH), position, due date, optional linked deal, assignee, creator and the assignee's department.

#### Scenario: Employee creates a task
- **WHEN** an EMPLOYEE creates a task
- **THEN** the task is assigned to that employee regardless of any `assigneeId` sent, and `TASK_CREATED` is audited

#### Scenario: Manager assigns a task
- **WHEN** a MANAGER creates a task for a user in the same department
- **THEN** the task is assigned to that user with the manager as creator

### Requirement: Deal link
The system SHALL allow a task to link only to a deal visible to the actor.

#### Scenario: Link to invisible deal
- **WHEN** a task is created or updated with a `dealId` outside the actor's scope
- **THEN** the response is 404 `DEAL_NOT_FOUND`

### Requirement: Completion timestamp
The system SHALL set `completed_at` when a task is created or updated with status DONE and SHALL clear it when a task is updated to any other status.

#### Scenario: Move to done
- **WHEN** a task's status is patched to DONE
- **THEN** `completedAt` is set to the current time

#### Scenario: Reopen
- **WHEN** a DONE task is patched to IN_PROGRESS
- **THEN** `completedAt` becomes null

### Requirement: Task listing
The system SHALL list tasks in scope ordered by status, position and due date, filterable by status, assignee and deal, with `limit`/`offset` pagination (default 25, max 100).

#### Scenario: Filter by status
- **WHEN** a user lists tasks with `status=DONE`
- **THEN** only in-scope DONE tasks are returned
