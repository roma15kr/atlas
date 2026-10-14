## MODIFIED Requirements

### Requirement: Role and record scope
The system SHALL scope every record query by company and role: a DIRECTOR sees all company records, a MANAGER sees records whose department is the manager's department or one of its sub-departments, and an EMPLOYEE sees only records they own or are assigned to. Scope SHALL be enforced in SQL predicates, not only in route role checks.

#### Scenario: Employee reads another user's record
- **WHEN** an EMPLOYEE requests a client, deal, task, or message owned by someone else
- **THEN** the response is 404 as if the record does not exist

#### Scenario: Manager outside department
- **WHEN** a MANAGER requests a record belonging to another department that is not one of their sub-departments
- **THEN** the response is 404

#### Scenario: Head of a parent department
- **WHEN** the head of «Отдел продаж», whose sub-department is «Отдел DIY», opens a DIY client, deal, task or Telegram conversation
- **THEN** it is shown as for a record of her own department

#### Scenario: Head of a sub-department
- **WHEN** the head of «Отдел DIY» requests a record of «Отдел продаж»
- **THEN** the response is 404

### Requirement: Owner assignment within scope
When a record is created or reassigned with an owner or assignee, the system SHALL accept only an ACTIVE user the actor can manage: any company user for a DIRECTOR, a user of the manager's department or of one of its sub-departments for a MANAGER, and only the actor themself for an EMPLOYEE. The record's department SHALL be taken from the chosen owner.

#### Scenario: Employee supplies another owner
- **WHEN** an EMPLOYEE creates a client with `ownerId` of a colleague
- **THEN** the client is owned by the employee, not the colleague

#### Scenario: Manager assigns outside department
- **WHEN** a MANAGER assigns a task to a user in another department that is not one of their sub-departments
- **THEN** the response is 403 `INVALID_OWNER`

#### Scenario: Assigning to a sub-department
- **WHEN** the head of «Отдел продаж» makes a DIY promoter the owner of a client
- **THEN** the client belongs to the promoter and to «Отдел DIY»
