# Tasks

## 1. Tracer bullet: the head of sales sees a DIY client

- [ ] 1.1 Add `database/018_department_parents.sql` (parent column, self-reference check, one-level and same-company trigger), and `departmentIds` on `AuthContext`, loaded in `authenticate` and on socket connect. Make `recordScope` use `ANY`. Verify a new `subDepartments.integration.test.ts` case — "the parent head opens a sub-department client; the sub-head gets 404 on the parent's client" — fails before and passes after, and existing scope tests stay green; commit.

## 2. Every department check covers sub-departments

- [ ] 2.1 Add `coversDepartment` and switch the remaining scope helpers and route checks listed in design.md (funnels, boards, Telegram, documents, reports, alerts, audit, AI, KPIs, dashboard, team directory, owner assignment, presence rooms). Verify the integration cases for deals, tasks, Telegram and owner assignment pass, and `rg "auth.departmentId"` shows only home-department uses; commit.
- [ ] 2.2 Let a parent head manage the sub-department's people, including its head (edit, reset password, disable/enable, KPIs) but not roles or departments. Verify the cases "parent head resets the sub-head's password" and "parent head changing the sub-head's role gets 403" pass; commit.

## 3. Department structure

- [ ] 3.1 Add `GET /api/v1/departments` and `PATCH /api/v1/departments/:id` (director only, one level, `DEPARTMENT_UPDATED`/`DEPARTMENT_UPDATE_DENIED`). Verify `departments.integration.test.ts` passes; commit.
- [ ] 3.2 Add the «Отделы» dialog on the Team page for directors, with a demo branch. Verify the `TeamAdmin.test.tsx` cases (director sets «Входит в»; manager sees no button) pass; commit.

## 4. Integration checks

- [ ] 4.1 Run `make check` and `npm run build`; verify both pass.
- [ ] 4.2 Run `npx openspec validate add-sub-departments --strict`; verify it passes.

## Workflow follow-up

- Merge into `dev`, check on the test app, then `dev` → `main`.
- Live: the director nests «Отдел DIY» under «Отдел продаж»; confirm Денисюк sees a DIY client and Семенець still sees only DIY.
- Archive the change.
