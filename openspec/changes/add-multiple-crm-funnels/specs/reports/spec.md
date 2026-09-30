# Spec Delta

## MODIFIED Requirements

### Requirement: Generate report
The system SHALL let a DIRECTOR or MANAGER create a named report with 1-12 metric labels, a period (end on or after start), a schedule label (ONCE, DAILY, WEEKLY, MONTHLY) and an optional target user within their scope. The result SHALL be computed immediately and stored with status READY. Deal metrics SHALL include only deals in funnels the report creator can access.

#### Scenario: Report for one employee
- **WHEN** a MANAGER creates a report for a user in their department
- **THEN** the stored result contains KPI progress, deal totals and won value in UAH, conversion, task totals with overdue count, and attendance days from presence history for that user and period, and `REPORT_CREATED` is audited

#### Scenario: Team report
- **WHEN** no target user is given
- **THEN** a MANAGER's report covers their department and a DIRECTOR's report covers the whole company

#### Scenario: Employee creates a report
- **WHEN** an EMPLOYEE posts a report
- **THEN** the response is 403 `FORBIDDEN`

#### Scenario: Restricted funnel excluded
- **WHEN** a MANAGER without access to the "Опт" funnel creates a report for an employee who owns "Опт" deals
- **THEN** the report's deal totals, won value and conversion exclude those deals

### Requirement: Won deals definition
The system SHALL count a deal as won when its stage outcome is `WON` and as lost when it is `LOST`. Conversion SHALL be won deals divided by deals created in the period.

#### Scenario: Lost deal
- **WHEN** a deal in the period is in a stage with outcome `LOST`
- **THEN** it counts toward total deals but not toward won deals or won value

#### Scenario: Custom won stage
- **WHEN** a DIRECTOR names a stage "Отгружено" with outcome `WON`
- **THEN** deals in it count as won regardless of the stage's name
