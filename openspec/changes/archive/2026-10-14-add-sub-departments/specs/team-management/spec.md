## ADDED Requirements

### Requirement: Sub-departments
A DIRECTOR SHALL be able to place a department under another department of the same company, or detach it. Only one level SHALL be allowed: a department that has a parent cannot be a parent, and a parent cannot be placed under another department. A department cannot be its own parent. Every change SHALL be audited as `DEPARTMENT_UPDATED` with the department and parent ids.

#### Scenario: Placing DIY under sales
- **WHEN** a DIRECTOR places «Отдел DIY» under «Отдел продаж»
- **THEN** «Отдел DIY» is a sub-department of «Отдел продаж» and the change is audited

#### Scenario: A second level
- **WHEN** a DIRECTOR tries to place «Отдел продаж», which already has a sub-department, under «Руководство»
- **THEN** the response is 400 `DEPARTMENT_NESTING` and nothing changes

#### Scenario: Not a director
- **WHEN** a MANAGER tries to change a department's parent
- **THEN** the response is 403, nothing changes, and the denial is audited

### Requirement: Heads manage their sub-departments
Wherever a MANAGER may view or manage people of their own department, a head of a parent department SHALL also view and manage the people of its sub-departments, including each sub-department's head: edit their card and job description, reset their password, disable or enable them, and manage their KPIs. Only a DIRECTOR SHALL change a role or a department.

#### Scenario: Head of sales resets the DIY head's password
- **WHEN** the head of «Отдел продаж» resets the password of the head of «Отдел DIY»
- **THEN** the password is reset, his sessions end, and `PASSWORD_RESET` is audited

#### Scenario: DIY head and the head of sales
- **WHEN** the head of «Отдел DIY» tries to edit the head of «Отдел продаж»
- **THEN** the response is 404

### Requirement: Department structure dialog
The Team screen SHALL give a DIRECTOR an «Отделы» dialog that lists every department with its head, the number of people and its parent, and lets them choose «Входит в» for each department. Departments that cannot be chosen as a parent (because of the one-level rule) SHALL not be offered. Other roles SHALL not see the dialog.

#### Scenario: Director sets the parent
- **WHEN** a DIRECTOR opens «Отделы», picks «Отдел продаж» in «Входит в» for «Отдел DIY» and saves
- **THEN** the list shows «Отдел DIY» under «Отдел продаж»
