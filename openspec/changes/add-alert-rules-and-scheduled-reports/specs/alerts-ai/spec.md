# Spec Delta

## MODIFIED Requirements

### Requirement: Scoped alert feed
The system SHALL list alerts newest first, each with:
- severity (INFO, WARNING, CRITICAL), rule, category, title, summary and evidence;
- the subject user and the linked deal;
- acknowledgement and resolution state.

The feed SHALL hold all company alerts for a DIRECTOR, department alerts for a MANAGER, and alerts about themselves for an EMPLOYEE. An alert linked to a deal SHALL be listed only to users who can see that deal under the deal record scope and funnel access. The feed SHALL return unresolved alerts by default, and resolved ones too with `state=all`.

#### Scenario: Manager reads alerts
- **WHEN** a MANAGER lists alerts
- **THEN** only alerts for the manager's department are returned

#### Scenario: Restricted funnel deal alert
- **WHEN** a MANAGER without access to the "Опт" funnel lists alerts and a stalled-deal alert exists for an "Опт" deal in their department
- **THEN** that alert is not returned

#### Scenario: History
- **WHEN** a DIRECTOR lists alerts with `state=all`
- **THEN** resolved alerts are included with `resolvedAt`

## ADDED Requirements

### Requirement: Alert rules
The system SHALL evaluate these rules for ACTIVE users on every automation run and create alerts:
- **`TASKS_OVERDUE`:** 3 or more open assigned tasks past due. WARNING, and CRITICAL at 6 or more.
- **`DEAL_CLOSE_OVERDUE`:** an open deal past its expected close date. WARNING, for the owner.
- **`DEAL_STALLED`:** an open deal unchanged for 14 days. INFO, for the owner.
- **`KPI_BEHIND`:** at least half of a KPI's period elapsed and its progress more than 30 percentage points behind the elapsed share. WARNING.
- **`INACTIVITY`:** a user who accepted the monitoring policy has had no presence for 3 working days. INFO.

Users without monitoring consent SHALL NOT be evaluated by presence-based rules. Alert evidence SHALL contain only counts, ids and dates.

#### Scenario: Overdue tasks
- **WHEN** an employee has 3 open tasks past due at an automation run
- **THEN** one WARNING `TASKS_OVERDUE` alert about them exists in their department

#### Scenario: No consent
- **WHEN** an employee without monitoring consent has not been online for a week
- **THEN** no `INACTIVITY` alert is created for them

### Requirement: Alert deduplication and resolution
The system SHALL keep at most one unresolved alert per rule and subject. It SHALL update that alert's severity and evidence while the condition persists, and SHALL mark it resolved when the condition no longer holds. Acknowledgement SHALL NOT resolve an alert.

#### Scenario: Condition persists
- **WHEN** the overdue condition still holds at the next run with 7 overdue tasks
- **THEN** no new alert is created and the existing alert becomes CRITICAL

#### Scenario: Condition clears
- **WHEN** the employee completes their overdue tasks
- **THEN** at the next run the alert gets `resolvedAt` and disappears from the default feed

### Requirement: AI analysis screens
The web app SHALL let users request an ADVICE, EVALUATION or FORECAST analysis:
- directors and managers, from the team screen, for themselves and the people they manage;
- everyone, from the profile screen, for themselves.

The result SHALL show the summary, the recommendations, and whether Claude or the built-in rules produced it.

#### Scenario: Manager requests a forecast
- **WHEN** a MANAGER opens "AI-анализ" for an employee of their department and chooses "Прогноз"
- **THEN** the forecast summary and recommendations are shown with the source badge
