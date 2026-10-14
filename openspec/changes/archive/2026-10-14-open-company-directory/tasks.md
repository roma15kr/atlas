# Tasks

## 1. Tracer bullet: an employee sees a colleague from another department

- [x] 1.1 Add `GET /api/v1/team/directory` (all active company users, contact fields only, `inTeam` from `recordScope`). Verify a new `companyDirectory.integration.test.ts`: an employee gets colleagues from every department with `inTeam` only for themselves; no KPIs, rating, job description, consent, presence or `birthDate` in any row; a hidden birthday is absent; another company's users are absent. Commit.

## 2. Team page

- [x] 2.1 Add `teamDirectory()` to `AppContext` with a demo branch. Build the Team list from it, and add the contact card for colleagues outside the team (no KPI, rating, job description, presence or buttons). Verify the `TeamAdmin.test.tsx` cases: an employee sees other departments and opens a contact card without actions; a head opening another department's colleague sees no «Изменить»/«Сбросить пароль»/«Отключить», and their own team member still has them. Commit.
- [x] 2.2 Confirm management stays scoped: a head's `PATCH /team/:id`, password reset and KPI creation for another department's colleague answer 404. Add the cases if missing; commit.

## 3. Integration checks

- [x] 3.1 Run `make check` and `npm run build`; verify both pass.
- [x] 3.2 Run `npx openspec validate open-company-directory --strict`; verify it passes.

## Workflow follow-up

- PR into `dev`, check on atlas-dev as an employee and as a head; then `dev` → `main`, live check, archive.
