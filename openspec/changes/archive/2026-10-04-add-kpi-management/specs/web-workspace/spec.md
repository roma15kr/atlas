# Spec Delta

## ADDED Requirements

### Requirement: KPI editing on the team screen
The team screen SHALL let users who may manage a member's KPIs add, edit and delete them in dialogs.
- Automatic KPIs SHALL be marked as such, and SHALL NOT offer an actual-value field.
- Users who can't manage KPIs SHALL see them read-only.

#### Scenario: Employee views own KPIs
- **WHEN** an EMPLOYEE opens their panel on the team screen
- **THEN** KPIs are listed without add, edit or delete actions
