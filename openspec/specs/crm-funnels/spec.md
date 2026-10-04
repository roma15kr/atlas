# crm-funnels Specification

## Purpose
Lets a company run several sales funnels, each with its own Director-managed stages, and restrict each funnel to chosen departments or people while keeping owner-based deal privacy inside it.

## Requirements

### Requirement: Funnels
The system SHALL let a company have one or more funnels, each with a name (1-100 characters, unique per company, case-insensitive), a sort order, an access mode (`COMPANY` or `RESTRICTED`), and an ordered list of stages. Every deal SHALL belong to exactly one funnel.

#### Scenario: Director creates a funnel
- **WHEN** a DIRECTOR creates a funnel named "Опт" with an initial list of stages
- **THEN** the funnel and its stages are created in the given order, the response is 201, and `FUNNEL_CREATED` is audited

#### Scenario: Funnel without stages
- **WHEN** a DIRECTOR creates a funnel with no stages
- **THEN** the response is 400 `VALIDATION_ERROR`

#### Scenario: Duplicate funnel name
- **WHEN** a DIRECTOR creates or renames a funnel to a name already used in the company, ignoring case
- **THEN** the response is 409 `FUNNEL_NAME_TAKEN`

### Requirement: Director-only configuration
The system SHALL allow only a DIRECTOR to create, rename, reorder or delete funnels, change funnel access, and create, edit, reorder or delete stages. Any other role SHALL receive 403 `DIRECTOR_ONLY`, and the attempt SHALL be audited as `FUNNEL_CONFIG_DENIED`.

#### Scenario: Manager edits a stage
- **WHEN** a MANAGER patches a stage name
- **THEN** the response is 403 `DIRECTOR_ONLY`, the stage is unchanged, and `FUNNEL_CONFIG_DENIED` is audited

### Requirement: Stage definition and editing
Each stage SHALL have a name (1-100 characters, unique within its funnel, case-insensitive), a color in `#RRGGBB` form, a position within its funnel, and an outcome of `OPEN`, `WON` or `LOST`. A DIRECTOR SHALL be able to add a stage, change a stage's name, color and outcome, and set the full stage order of a funnel.

#### Scenario: Rename and recolor
- **WHEN** a DIRECTOR patches a stage's name and color
- **THEN** every deal in that stage shows the new name and color, and `DEAL_STAGE_UPDATED` is audited

#### Scenario: Reorder stages
- **WHEN** a DIRECTOR submits the funnel's complete list of stage ids in a new order
- **THEN** the stages are shown in that order and `DEAL_STAGES_REORDERED` is audited

#### Scenario: Incomplete reorder
- **WHEN** the submitted order omits a stage of the funnel or includes a stage from another funnel
- **THEN** the response is 400 `INVALID_STAGE_ORDER` and the order is unchanged

#### Scenario: Change outcome
- **WHEN** a DIRECTOR changes a stage's outcome from `OPEN` to `WON`
- **THEN** deals in that stage count as won in reports and no longer count as open pipeline

#### Scenario: Funnel keeps an open stage
- **WHEN** a change would leave a funnel with no `OPEN` stage
- **THEN** the response is 400 `OPEN_STAGE_REQUIRED`

### Requirement: Stage deletion relocates deals
The system SHALL delete a stage only together with a target stage in the same funnel. All deals in the deleted stage SHALL move to the target stage in the same transaction as the deletion. The deletion SHALL be audited as `DEAL_STAGE_DELETED` with the target stage and the number of deals moved. A funnel's last stage SHALL NOT be deletable.

#### Scenario: Delete stage with deals
- **WHEN** a DIRECTOR deletes the "Переговоры" stage holding 7 deals and chooses "Счёт выставлен" as the target
- **THEN** the 7 deals are in "Счёт выставлен", the stage no longer exists, and one audit event records 7 moved deals

#### Scenario: Missing target stage
- **WHEN** a DIRECTOR deletes a stage that holds deals without naming a target stage
- **THEN** the response is 400 `TARGET_STAGE_REQUIRED` and nothing changes

#### Scenario: Target in another funnel
- **WHEN** the target stage belongs to a different funnel or is the stage being deleted
- **THEN** the response is 400 `INVALID_TARGET_STAGE` and nothing changes

#### Scenario: Empty stage
- **WHEN** a DIRECTOR deletes a stage that holds no deals
- **THEN** the stage is deleted without requiring a target stage

#### Scenario: Last stage
- **WHEN** a DIRECTOR deletes the only stage of a funnel
- **THEN** the response is 409 `LAST_STAGE`

### Requirement: Funnel deletion
The system SHALL allow a DIRECTOR to delete a funnel only when it holds no deals and is not the company's last funnel. Deleting a funnel SHALL delete its stages and access grants and SHALL be audited as `FUNNEL_DELETED`.

#### Scenario: Funnel with deals
- **WHEN** a DIRECTOR deletes a funnel that holds deals
- **THEN** the response is 409 `FUNNEL_NOT_EMPTY`

#### Scenario: Last funnel
- **WHEN** a DIRECTOR deletes the company's only funnel
- **THEN** the response is 409 `LAST_FUNNEL`

### Requirement: Funnel access control
A `COMPANY` funnel SHALL be accessible to every ACTIVE user of the company. A `RESTRICTED` funnel SHALL be accessible only to DIRECTORs, to users granted access individually, and to members of departments granted access. A DIRECTOR SHALL be able to switch the mode and replace the full set of granted departments and users, which SHALL belong to the company. The change SHALL be audited as `FUNNEL_ACCESS_UPDATED` with the previous and new grants.

#### Scenario: Restrict to a department
- **WHEN** a DIRECTOR restricts the "Опт" funnel to the "Продажи" department
- **THEN** members of "Продажи" and all DIRECTORs can open it, and no one else can

#### Scenario: Grant a single person
- **WHEN** a DIRECTOR adds an EMPLOYEE from another department to the restricted funnel's users
- **THEN** that employee can open the funnel

#### Scenario: Grant from another company
- **WHEN** the grant list contains a department or user outside the company
- **THEN** the response is 400 `INVALID_ACCESS_GRANT` and grants are unchanged

### Requirement: Access gate combined with role scope
The system SHALL treat funnel access as a gate in addition to the existing record scope. A user SHALL see a deal only when they can access its funnel AND the deal is within their role scope: all deals for a DIRECTOR, deals of their department for a MANAGER, their own deals for an EMPLOYEE. A deal in an inaccessible funnel SHALL behave as not found.

#### Scenario: Manager with funnel access
- **WHEN** a MANAGER of "Продажи" opens a funnel granted to "Продажи" that also contains deals owned by another department
- **THEN** only the deals of "Продажи" are shown

#### Scenario: Employee without funnel access
- **WHEN** an EMPLOYEE requests a deal they own in a funnel they cannot access
- **THEN** the response is 404 `DEAL_NOT_FOUND`

### Requirement: Funnel listing
The system SHALL list only the funnels the caller can access, ordered by sort order, each with its stages in order. For DIRECTORs, it SHALL also include the access mode and grants.

#### Scenario: Employee lists funnels
- **WHEN** an EMPLOYEE without any restricted grants lists funnels
- **THEN** only `COMPANY` funnels are returned, without access grant details

### Requirement: Deal owner must have funnel access
The system SHALL reject creating a deal in a funnel, moving a deal into a funnel, or reassigning a deal's owner when either the acting user or the resulting owner cannot access the funnel.

#### Scenario: Assign to owner without access
- **WHEN** a MANAGER creates a deal in a restricted funnel for an employee who has no access to it
- **THEN** the response is 403 `OWNER_FUNNEL_ACCESS_REQUIRED`

#### Scenario: Move deal to another funnel
- **WHEN** a user moves a deal to a stage of another funnel that both the user and the owner can access
- **THEN** the deal belongs to the new funnel and stage and `DEAL_UPDATED` is audited with the funnel change

### Requirement: Funnel-aware aggregates
Dashboard pipeline totals, report deal metrics and AI pipeline metrics SHALL include only deals in funnels the viewing or requesting user can access, in addition to their record scope. Open pipeline SHALL mean deals in `OPEN` stages.

#### Scenario: Dashboard for a user without access to a funnel
- **WHEN** a MANAGER without access to the "Опт" funnel opens the dashboard
- **THEN** pipeline value and open deal counts exclude every "Опт" deal, including deals of the manager's department

### Requirement: Default funnel for existing data
When the change is deployed, the system SHALL place every company's existing stages and deals into one `COMPANY` funnel, keeping each deal's stage, stage names, colors and order. Stages previously marked closed SHALL get outcome `LOST` when their key was `LOST` and `WON` otherwise. Open stages SHALL get `OPEN`.

#### Scenario: Upgrade existing company
- **WHEN** the migration runs on a company with deals in the default stages
- **THEN** all users still see the same deals in the same stages under one company-wide funnel
