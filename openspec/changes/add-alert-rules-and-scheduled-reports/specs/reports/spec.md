# Spec Delta

## ADDED Requirements

### Requirement: Report results screen
The reports screen SHALL:
- filter reports by schedule;
- show a report's latest figures and its run history in a dialog;
- offer pause, resume and delete to users who may change the report.

#### Scenario: Opening a weekly report
- **WHEN** a manager opens a weekly report
- **THEN** the latest KPI progress, deals, won value in UAH, conversion, tasks and attendance are shown, with the list of earlier runs


### Requirement: Recurring report runs
The system SHALL re-run active recurring reports at 06:00 Europe/Kyiv:
- DAILY: every day, for the previous day;
- WEEKLY: every Monday, for the previous Monday–Sunday;
- MONTHLY: on the 1st, for the previous calendar month.

Each run SHALL:
- use the creator's access scope;
- be stored in the report's run history;
- become the report's current result.

Missed runs SHALL execute once, for the latest period. When the creator is no longer an ACTIVE director or manager, the schedule SHALL pause and `REPORT_SCHEDULE_PAUSED` SHALL be audited.

#### Scenario: Weekly report on Monday
- **WHEN** the automation runs on Monday after 06:00 Kyiv time for an active WEEKLY report
- **THEN** a run for the previous Monday–Sunday is stored and the next run is set to the following Monday 06:00

#### Scenario: Creator disabled
- **WHEN** a recurring report is due and its creator is DISABLED
- **THEN** no run is stored, the report becomes inactive, and `REPORT_SCHEDULE_PAUSED` is audited

### Requirement: Report history and management
The system SHALL return a report's runs, newest first, to anyone who may list the report. It SHALL let a DIRECTOR, or a MANAGER for their department's reports:
- pause and resume a recurring report;
- delete a report together with its runs.

EMPLOYEEs SHALL be refused these changes.

#### Scenario: Manager pauses a department report
- **WHEN** a MANAGER pauses a recurring report of their department
- **THEN** it stops running and `REPORT_SCHEDULE_PAUSED` is audited

#### Scenario: Employee deletes a report
- **WHEN** an EMPLOYEE deletes a report targeting them
- **THEN** the response is 403 `FORBIDDEN`
