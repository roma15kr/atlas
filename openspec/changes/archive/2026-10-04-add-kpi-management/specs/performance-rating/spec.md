# Spec Delta

## ADDED Requirements

### Requirement: KPI management
The system SHALL let a DIRECTOR create, change and delete KPIs of any ACTIVE company user, and a MANAGER do so for EMPLOYEEs of their own department. Each KPI SHALL have:
- a name and a unit;
- a target above 0;
- a weight;
- an optional deadline;
- a source (`MANUAL`, `DEALS_WON_VALUE`, `DEALS_WON_COUNT`, `TASKS_DONE` or `TASKS_ON_TIME_RATE`).

EMPLOYEEs SHALL read only their own KPIs. Changes and denied attempts SHALL be audited.

#### Scenario: Manager sets a KPI for an employee
- **WHEN** a MANAGER creates a `MANUAL` KPI with target 20 for an employee of their department
- **THEN** the KPI is stored, the employee's rating includes it, and `KPI_CREATED` is audited

#### Scenario: Manager targets another manager
- **WHEN** a MANAGER creates a KPI for another MANAGER of the same department
- **THEN** the response is 403 `KPI_MANAGER_ONLY` and `KPI_CHANGE_DENIED` is audited

#### Scenario: Employee edits a KPI
- **WHEN** an EMPLOYEE patches one of their own KPIs
- **THEN** the response is 403 `KPI_MANAGER_ONLY` and nothing changes

### Requirement: Automatic KPI sources
The system SHALL compute the actual value of automatic KPIs over the KPI's period:
- **`DEALS_WON_VALUE`:** the UAH value of the user's deals closed in a WON stage within the period.
- **`DEALS_WON_COUNT`:** the number of such deals.
- **`TASKS_DONE`:** the number of tasks assigned to the user completed within the period.
- **`TASKS_ON_TIME_RATE`:** the percentage of the user's tasks due within the period that were completed by their due date, counting open tasks past due as late.

An automatic KPI SHALL require a period and SHALL reject a manual `actual` value. Values SHALL be recomputed when the KPI changes and at least every 10 minutes while the period is current. They SHALL stop changing 2 days after the period ends.

#### Scenario: Won deal counted
- **WHEN** an employee with a `DEALS_WON_COUNT` KPI for this month moves a deal into a WON stage
- **THEN** after the next automation run the KPI's actual value has increased by 1

#### Scenario: Manual actual on an automatic KPI
- **WHEN** a manager sends `actual` for a `TASKS_DONE` KPI
- **THEN** the response is 400 `KPI_ACTUAL_COMPUTED`

### Requirement: Achievement awarding
The system SHALL award achievements to ACTIVE users automatically, at most once per user and achievement, auditing `ACHIEVEMENT_AWARDED` and notifying the user in real time:
- **ON_TIME_10:** the user's 10 most recently completed tasks that had a due date were all completed on time.
- **ZERO_OVERDUE:** in the previous calendar month, the user had at least 5 assigned tasks due, and all were completed by their due date.
- **TOP_MONTH:** on the first day of a month, the user has the highest rating above 0 among ACTIVE non-director users of the company. Ties all receive it.

#### Scenario: Ten tasks on time
- **WHEN** an employee completes their tenth consecutive task with a due date before that date
- **THEN** after the next automation run they hold ON_TIME_10, and running the job again awards nothing new

#### Scenario: One late task
- **WHEN** one of an employee's last 10 completed tasks with a due date was finished late
- **THEN** ON_TIME_10 is not awarded

### Requirement: Automation scheduler
The system SHALL run automation (KPI recomputation and achievement awarding) every `AUTOMATION_INTERVAL_MS` milliseconds (default 600000) in exactly one API process at a time, using a database advisory lock. A value of 0 SHALL disable the schedule. A failing step SHALL NOT prevent the other steps.

#### Scenario: Two API processes
- **WHEN** two API processes reach a tick at the same time
- **THEN** only one runs the automation steps
