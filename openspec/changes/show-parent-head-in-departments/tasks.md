# Tasks

## 1. Dialog

- [x] 1.1 Show the parent's head, marked «через …», for a sub-department without its own head in `DepartmentsDialog`. Verify a `TeamAdmin.test.tsx` case (a director sees «… · через «…»» for such a sub-department, and a department with its own head is unchanged); commit.

## 2. Integration checks

- [x] 2.1 Run `make check` and `npm run build`; verify both pass.
- [x] 2.2 Run `npx openspec validate show-parent-head-in-departments --strict`; verify it passes.
