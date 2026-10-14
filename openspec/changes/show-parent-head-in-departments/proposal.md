# Proposal

## Why

**Problem.** After the sales restructure on 2026-10-14, «Отдел продаж» and «Call-центр» have no head of their own: Наталія Денисюк leads them as head of their parent, «Департамент продаж». The «Отделы» dialog shows «—» as their head, which reads as "nobody is in charge".

**Evidence.** Денисюк asked for «Отдел продаж — Natalia is the head» and «Call-центр — no head, or Natalia», and the director chose the department structure where she leads them through «Департамент продаж».

**Success metric.** The dialog shows who leads every sub-department, with no «—» for «Отдел продаж» and «Call-центр».

## What Changes

- In «Команда → Отделы», a sub-department without its own head shows its parent's head, marked «через «Департамент продаж»».
- Departments with their own head, and top-level departments, are unchanged.

## Announcement

The «Отделы» list now shows who leads each sub-department, including those led through their parent department.

## Non-goals

- Two heads for one department, or a "head" title separate from the MANAGER role.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `team-management`: the department structure dialog shows a parent's head for sub-departments without their own.

## Impact

- **Web:** `DepartmentsDialog` only. No API or data change.
