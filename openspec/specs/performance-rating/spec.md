# performance-rating Specification

## Purpose
Expresses each employee's success as a weighted KPI rating and shows earned achievement badges to the employee and their managers.

## Requirements

### Requirement: Weighted KPI rating
The system SHALL compute a user's rating as the weight-averaged ratio of actual to target across their KPIs, capping each KPI at 120%, rounded to a whole percent, and 0 when the user has no weighted KPIs.

#### Scenario: Over-achievement cap
- **WHEN** a KPI's actual value is twice its target
- **THEN** that KPI contributes 120% to the weighted average

#### Scenario: No KPIs
- **WHEN** a user has no KPIs
- **THEN** the rating is 0

### Requirement: Achievement catalog
The system SHALL ensure each company has the achievement definitions ON_TIME_10, ZERO_OVERDUE and TOP_MONTH with name, description, icon and points on production startup.

#### Scenario: Startup on an existing company
- **WHEN** the API starts in production
- **THEN** missing default definitions are inserted and existing ones are left unchanged

### Requirement: Scoped achievements view
The system SHALL return a user's awarded achievements (newest first) and rating to that user, to a MANAGER of their department, and to a DIRECTOR.

#### Scenario: Employee requests a colleague
- **WHEN** an EMPLOYEE requests achievements with another `userId`
- **THEN** the employee's own achievements are returned
