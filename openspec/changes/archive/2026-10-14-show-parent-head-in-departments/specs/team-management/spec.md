## MODIFIED Requirements

### Requirement: Department structure dialog
The Team screen SHALL give a DIRECTOR an «Отделы» dialog that lists every department with its head, the number of people and its parent, and lets them choose «Входит в» for each department. A sub-department without a head of its own SHALL show its parent's head, marked «через «<parent>»». Departments that cannot be chosen as a parent (because of the one-level rule) SHALL not be offered. Other roles SHALL not see the dialog.

#### Scenario: Director sets the parent
- **WHEN** a DIRECTOR opens «Отделы», picks «Отдел продаж» in «Входит в» for «Отдел DIY» and saves
- **THEN** the list shows «Отдел DIY» under «Отдел продаж»

#### Scenario: Sub-department led through its parent
- **WHEN** «Call-центр» has no head of its own and belongs to «Департамент продаж», headed by Денисюк
- **THEN** the dialog shows «Денисюк Наталія Василівна · через «Департамент продаж»» as its head
