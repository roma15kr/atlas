# Design

## Context

See proposal.md (Why) and the spec deltas.

- **No hierarchy today.** `departments` has no hierarchy, and `AuthContext.departmentId` is the only department a MANAGER acts within.
- **About 30 call sites compare against that single id:**
  - `recordScope`, `funnelAccessSql`, `boardAccessSql`, `telegramAccessSql` and the manager checks in `scope.ts`;
  - `teamAdmin.ts` (`adminDenial`), `team.ts` (directory, creation policy) and `kpis.ts`;
  - `alerts.ts`, `audit.ts`, `reports.ts`, `ai.ts`, `documents.ts`, `dashboard.ts` and `taskBoards.ts`;
  - `routes/telegram.ts`, `telegram/importContacts.ts` and `telegram/handleUpdate.ts`;
  - presence rooms in `socket.ts`.
- **One query per request.** `authenticate` (`auth.ts`) already reads the user row on every request; `socket.ts` builds an `AuthContext` on connect.
- **No department settings.** Departments are created by name when people are added or moved (`team.ts`, `teamAdmin.ts`); no endpoint or screen manages departments themselves.

## Goals / Non-Goals

**Goals:**
- One place decides "which departments this head covers"; every check uses that list.
- No behavior change for anyone except heads of departments that have sub-departments.

**Non-Goals:**
- Recursive trees.
- Caching (the extra subquery rides on the query `authenticate` already runs).
- Changing funnel or board access grants.

## Decisions

1. **Data.**
   - Migration `018_department_parents.sql` adds `departments.parent_id uuid REFERENCES departments(id) ON DELETE SET NULL` and `CHECK (parent_id <> id)`.
   - A trigger enforces one level and the same company: the parent must have no parent, the child must have no children, and both belong to one company. The API checks the same rule first, to answer with a clear 400.
2. **`AuthContext.departmentIds: string[]`.**
   - For a MANAGER: their department plus its sub-departments. For others: their department, or nothing.
   - Filled by `authenticate` with `ARRAY(SELECT id FROM departments WHERE parent_id = u.department_id)`, in the same query, and likewise when a socket connects.
   - `departmentId` stays as "home department": it's used where something is created *in* a department (a new board, a document, a member created by a head).
3. **Scope predicates** change from `department_id = $n` / `IS NOT DISTINCT FROM $n` to `department_id = ANY($n::uuid[])`, using `departmentIds`. JS checks change from `x === auth.departmentId` to a helper `coversDepartment(auth, id)`.
   - *Alternative:* expand departments inside each SQL predicate with a subquery. Rejected: about 30 subqueries, and easy to miss one.
4. **Who a head manages.** `adminDenial` and the KPI and creation policies allow a MANAGER to act on EMPLOYEEs of their own department, as today. For sub-departments they may also act on the sub-department head (a MANAGER). Role and department changes stay DIRECTOR-only.
5. **Presence.** A parent head also joins the presence rooms of their sub-departments, so DIY people show online for the head of sales.
6. **API.**
   - `GET /api/v1/departments`: DIRECTOR and MANAGER. Returns id, name, parent id, head and member count, within scope.
   - `PATCH /api/v1/departments/:id { parentId: uuid | null }`: DIRECTOR only. A denial is audited as `DEPARTMENT_UPDATE_DENIED`, a change as `DEPARTMENT_UPDATED` with `{ departmentId, parentId, previousParentId }`.
7. **UI.** A director-only «Отделы» button on the Team page opens a dialog: a read-only list (department, head, people, «Входит в»), edited per row through a select. Only valid parents are offered. Demo mode keeps the parent in local state.

**Access rules:**
- **DIRECTOR:** everything, as today; the only one who sets parents.
- **MANAGER:** own department plus its sub-departments, including managing the sub-department's head.
- **EMPLOYEE:** unchanged.

**Migration:** `018_department_parents.sql`.

**Audit events:** `DEPARTMENT_UPDATED` and `DEPARTMENT_UPDATE_DENIED` (new).

### Files

| File | Change |
|---|---|
| `database/018_department_parents.sql` | parent column, check, one-level trigger |
| `apps/api/src/types.ts` | `departmentIds` on `AuthContext` |
| `apps/api/src/auth.ts`, `socket.ts` | load `departmentIds`; presence rooms for sub-departments |
| `apps/api/src/scope.ts` | `coversDepartment`; all scope helpers use `ANY` |
| `apps/api/src/routes/{teamAdmin,team,kpis,alerts,audit,reports,ai,documents,dashboard,taskBoards,telegram}.ts`, `telegram/{importContacts,handleUpdate}.ts` | single-department comparisons → `departmentIds` / `coversDepartment` |
| `apps/api/src/routes/departments.ts`, `app.ts` | list and parent update |
| `apps/web/src/components/team/DepartmentsDialog.tsx`, `pages/TeamPage.tsx`, `context/AppContext.tsx`, `lib/api.ts` usage | dialog, button, demo branch |

### Types and signatures

```ts
interface AuthContext { userId: string; companyId: string; departmentId: string | null; departmentIds: string[]; username: string; role: Role }
export function coversDepartment(auth: AuthContext, departmentId: string | null | undefined): boolean;
// GET /api/v1/departments
interface DepartmentSummary { id: string; name: string; parentId: string | null; head: { id: string; fullName: string } | null; memberCount: number }
```

### Call stacks

- **Head of sales opens a DIY client:** `authenticate` (departmentIds = [sales, diy]) → `scopedClient` → `recordScope` (`c.department_id = ANY($2)`) → 200.
- **Director nests DIY:** «Отделы» dialog → `PATCH /departments/:id` → one-level check → `UPDATE` → audit. The next request of the head of sales carries the new `departmentIds`.

### Test plan

- `scope.test.ts`: `recordScope` uses `ANY` with `departmentIds`; `coversDepartment` is true for own and sub-departments only.
- `departments.integration.test.ts` (dbHarness):
  - director nests and detaches; a second level → 400 `DEPARTMENT_NESTING`; manager → 403, audited;
  - list scoped for a manager;
  - the trigger rejects nesting written directly in SQL.
- `subDepartments.integration.test.ts` (dbHarness):
  - the parent head sees a sub-department client, deal, task and Telegram contact;
  - the sub-department head gets 404 on the parent's records;
  - the parent head resets the sub-head's password, but can't change his role (403);
  - a head without sub-departments is unchanged.
- Existing manager-scope tests stay green, as the regression net.
- `TeamAdmin.test.tsx`: the director sees «Отделы», sets «Входит в» and sees the structure; a manager sees no button.

## Risks / Trade-offs

- [A call site keeps comparing one department id] → the design lists all of them; an integration test covers each major area; `rg 'auth.departmentId'` in review should show only "create in my department" uses.
- [A parent head can reset the sub-head's password] → intended by the proposal; audited; flagged below.
- [Wider visibility appears the moment a director nests a department] → the dialog says what the head will see before saving.

## Migration Plan

1. Deploy migration 018; every department starts without a parent, so nothing changes.
2. After deploy, the director nests «Отдел DIY» under «Отдел продаж» in «Отделы» (or I do it through the API on request).
3. Rollback: detach in the dialog; the column can stay.

## Least confident decisions

1. The head of a parent department can reset the password of, and disable, the head of a sub-department.
2. Funnel and board grants are not inherited: a funnel opened to «Отдел продаж» stays closed to DIY people unless granted separately.
3. One level only.
