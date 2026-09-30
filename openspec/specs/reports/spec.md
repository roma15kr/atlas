# reports Specification

## Purpose
Lets directors and managers generate performance reports for an employee or a team over a date range, covering KPI progress, deals and conversion, tasks, and attendance.

## Requirements

### Requirement: Generate report
The system SHALL let a DIRECTOR or MANAGER create a named report with 1-12 metric labels, a period (end on or after start), a schedule label (ONCE, DAILY, WEEKLY, MONTHLY) and an optional target user within their scope. The result SHALL be computed immediately and stored with status READY.

#### Scenario: Report for one employee
- **WHEN** a MANAGER creates a report for a user in their department
- **THEN** the stored result contains KPI progress, deal totals and won value in UAH, conversion, task totals with overdue count, and attendance days from presence history for that user and period, and `REPORT_CREATED` is audited

#### Scenario: Team report
- **WHEN** no target user is given
- **THEN** a MANAGER's report covers their department and a DIRECTOR's report covers the whole company

#### Scenario: Employee creates a report
- **WHEN** an EMPLOYEE posts a report
- **THEN** the response is 403 `FORBIDDEN`

### Requirement: Won deals definition
The system SHALL count a deal as won when its stage is closed and its key is not `LOST`, and SHALL compute conversion as won deals divided by deals created in the period.

#### Scenario: Lost deal
- **WHEN** a deal in the period is in stage LOST
- **THEN** it counts toward total deals but not toward won deals or won value

### Requirement: Scoped report listing
The system SHALL list reports newest first: all company reports for a DIRECTOR, department reports for a MANAGER, and reports targeting themselves for an EMPLOYEE.

#### Scenario: Employee reads reports
- **WHEN** an EMPLOYEE lists reports
- **THEN** only reports whose target user is that employee are returned
