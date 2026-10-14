## MODIFIED Requirements

### Requirement: Company contact directory
The system SHALL let every authenticated user list the ACTIVE users of their own company through `GET /api/v1/team/directory`, as contact entries only: name, role, department, job title, specialty, photo, work phone, contact email, city, "about" and the shared birthday (`MM-DD`), plus whether the colleague is online now (`online`), without any time. Each entry SHALL carry `inTeam`, true within the caller's record scope. `GET /api/v1/team` and every management action SHALL keep their existing scope.

#### Scenario: Employee looks up another department
- **WHEN** an EMPLOYEE of «Отдел DIY» calls `GET /api/v1/team/directory`
- **THEN** active colleagues from every department are returned with contact fields, and `inTeam` is true only for the employee

#### Scenario: No performance or monitoring data
- **WHEN** any user calls `GET /api/v1/team/directory`
- **THEN** no entry contains KPIs, rating, job description, consent, a last-seen time, presence history or `birthDate`

#### Scenario: Other companies and leavers
- **WHEN** another company has users and a colleague is DISABLED
- **THEN** neither appears in the directory

#### Scenario: Head and another department
- **WHEN** the head of «Отдел промышленного электрообогрева» lists the directory and then tries to edit a member of «Отдел продаж»
- **THEN** the member is listed with `inTeam: false`, and the edit answers 404

#### Scenario: Colleague online
- **WHEN** a colleague from another department has Atlas open and is active
- **THEN** their entry has `online: true`, and no `lastSeenAt`

### Requirement: Colleague contact card
The Team screen SHALL list every active colleague of the company, with search by name, job title or department.
- Every row SHALL show whether the person is online now; the «В сети» and «Не в сети» tabs SHALL filter the whole company, and the status SHALL update live.
- For people outside the caller's team the screen SHALL NOT show a last-seen time.
- Selecting someone in the caller's team SHALL show the full card as before.
- Selecting anyone else SHALL show a contact card:
  - with name, photo, job title, department, role, specialty and the shared contact fields;
  - with «В сети» or «Не в сети»;
  - without KPIs, rating, job description, consent, last-seen time, presence history or any action buttons.
- Adding people and the «Отключённые» tab SHALL stay as they are.

#### Scenario: Employee opens a colleague from another department
- **WHEN** an employee selects a colleague from another department in «Команда»
- **THEN** the contact card shows the colleague's job title, department and phone, and no KPI, rating or edit controls

#### Scenario: Head opens their own and another team's member
- **WHEN** a department head selects a member of their own department, then a colleague from another department
- **THEN** the first card offers «Изменить», «Сбросить пароль» and «Отключить», and the second offers none

#### Scenario: Head filters by online status
- **WHEN** a department head opens the «В сети» tab while a colleague from another department is online
- **THEN** that colleague is listed with «В сети», without a last-seen time, and moves to «Не в сети» as soon as they go offline
