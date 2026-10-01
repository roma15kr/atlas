# Tasks

## 1. Database

- [ ] 1.1 Add `database/009_user_administration.sql`. Verify on PGlite with and without demo data.

## 2. API

- [ ] 2.1 Add `assertCanAdminister` and the last-director guard. Verify with unit tests over the role table, including a manager targeting a manager and a director demoting the last director.
- [ ] 2.2 Add `PATCH /team/:id`, covering role and department changes. Verify with supertest: a director moves an employee to a new department, a manager can't change a role, and `TEAM_MEMBER_UPDATED` lists the fields.
- [ ] 2.3 Add disable and enable: sessions revoked, sockets closed, triggers applied. Verify with tests: the disabled user's refresh fails, their access token gets 401, a self-disable gives 409, and they leave the company chat channel.
- [ ] 2.4 Add reset password and the forced change guard. Verify with tests: login works with the temporary password, other endpoints give 403 `PASSWORD_CHANGE_REQUIRED`, and the lock is cleared.
- [ ] 2.5 Add `POST /auth/password`. Verify with tests: a wrong current password gives 400 and is audited, the same password gives 400 `PASSWORD_REUSED`, and success revokes other sessions while the returned session works.
- [ ] 2.6 Add `GET /team?status=all`. Verify that an employee gets only themselves and a manager gets their department, including disabled users.

## 3. Web

- [ ] 3.1 Add `AppContext` actions `updateMember`, `setMemberStatus`, `resetMemberPassword` and `changePassword`, with demo implementations.
- [ ] 3.2 Add TeamPage actions and dialogs, plus the "Отключённые" filter. Verify with Testing Library: a manager sees no role field, disable asks for confirmation, and a reset shows the copyable credentials.
- [ ] 3.3 Add the ProfilePage password dialog and the `ChangePasswordPage` gate. Verify with tests: a forced session renders only the change screen, and success returns to the dashboard.
- [ ] 3.4 Take screenshots at desktop and 400px widths, checked against `ui-design-system`.

## 4. Verification

- [ ] 4.1 Run `npm run typecheck && npm test && npm run build` and `openspec validate add-user-administration --strict`.
- [ ] 4.2 On the test app, with a throwaway employee:
  - edit, reset, then sign in and do the forced change;
  - disable: login is refused and the socket is closed;
  - enable again.
