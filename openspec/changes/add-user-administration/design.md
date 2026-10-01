# Design

## Context

- `users.status` is `ACTIVE` or `DISABLED`.
- `authenticate` and the socket handshake already reject non-ACTIVE users on every request.
- Triggers from migrations 006 and 008 react to `status = 'DISABLED'`: one removes chat memberships, the other unassigns Telegram contacts.
- Creating a member follows `assertTeamCreationPolicy`.
- The password rule is at least 12 characters, with a lowercase letter, an uppercase letter, a digit and a symbol.

## Decisions

### 1. Migration `009_user_administration.sql`
- `ALTER TABLE users ADD COLUMN must_change_password boolean NOT NULL DEFAULT false, ADD COLUMN password_changed_at timestamptz`.
- No backfill. Existing users are not forced to change their password.

### 2. Who can manage whom (`access.ts` → `assertCanAdminister(auth, target, action)`)

| Actor | Target | edit profile fields | role / department | disable / enable | reset password |
| --- | --- | --- | --- | --- | --- |
| DIRECTOR | anyone in company | yes | yes, except self | yes, except self | yes, except self (use own change) |
| MANAGER | EMPLOYEE of own department | yes | no (403 `ROLE_CHANGE_FORBIDDEN`) | yes | yes |
| MANAGER | anyone else | 404 `USER_NOT_FOUND` if out of scope, 403 `MANAGER_EMPLOYEE_ONLY` for a manager or director in the department | | | |
| EMPLOYEE | anyone | 403 `FORBIDDEN` | | | |

Guards:
- **Last director.** Demoting or disabling the last ACTIVE director gives 409 `LAST_DIRECTOR`. The check runs inside the transaction with `FOR UPDATE` on the company's director rows.
- **Managers need a department.** Setting role MANAGER or EMPLOYEE without a department gives 400 `DEPARTMENT_REQUIRED`. A department can be given by `departmentId` or a new `departmentName`, which reuses the creation code and its advisory lock.
- **Denied attempts** are audited as `TEAM_MEMBER_ADMIN_DENIED` with the attempted action.

### 3. Effects
- **Disable:**
  - `UPDATE users SET status='DISABLED'`;
  - revoke all refresh tokens (`UPDATE refresh_tokens SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`);
  - after commit, `disconnectUser(userId)` runs `io.in(userRoom).disconnectSockets(true)`, and `markOffline` runs.
  - Open access tokens already fail on their next request.
- **Enable:** set `status='ACTIVE'`. Chat memberships for the company channel come back through the existing trigger. Telegram contacts stay unassigned.
- **Reset password:**
  - store the new bcrypt hash;
  - set `must_change_password=true`, `failed_login_count=0`, `locked_until=NULL`;
  - revoke all refresh tokens and disconnect sockets.
  - The response never echoes the password.
- **Own change** (`POST /auth/password`, authenticated):
  - verify `currentPassword` with bcrypt. A wrong one gives 400 `INVALID_CURRENT_PASSWORD`, audited as `PASSWORD_CHANGE_DENIED`.
  - The new password must pass the strength rule and differ from the current one (400 `PASSWORD_REUSED`).
  - It sets `must_change_password=false` and `password_changed_at=now()`.
  - It revokes all refresh tokens, issues a new session cookie and access token, and returns `{ accessToken, user }`.

### 4. Forced change guard
- `authenticate` already loads the user, so it also selects `must_change_password`.
- When that flag is true, any `/api/v1` path other than `/auth/*` gets 403 `PASSWORD_CHANGE_REQUIRED`. `/auth/*` routes mount before `authenticate`, and `/auth/password` and `/auth/me` use it directly with a flag that allows them.
- The socket handshake refuses the connection with `password_change_required`.
- The login and refresh responses include `user.mustChangePassword`.

### 5. Directory
- `GET /team?status=all` is for DIRECTOR and MANAGER, within their usual scope. It adds a `status` field to each row and includes DISABLED users. The default listing is unchanged.

### 6. Web
- **TeamPage member panel**, in the existing panel actions:
  - "Изменить": a dialog with name, job title, specialty and description. Directors also get role and department.
  - "Сбросить пароль": a dialog with a generated temporary password, then a copy-credentials success view like onboarding.
  - "Отключить": a confirm dialog that explains what it means, or "Включить".
- A "Отключённые" segment appears in the presence filter for directors and managers.
- **ProfilePage** "Безопасность" → "Изменить пароль" opens a dialog with the current, new and repeated password.
- **`App.tsx`:** when `session.user.mustChangePassword`, every route renders `ChangePasswordPage`, a centered login-style card. On success, the session is replaced.

### Access rules
Summarized in the table above. The API remains the authority; the web app hides actions the caller can't perform.

### Migrations and audit
- **Migration:** `009_user_administration.sql`.
- **Audit:**
  - `TEAM_MEMBER_UPDATED` (metadata: changed field names, plus old and new role and department ids);
  - `TEAM_MEMBER_DISABLED`;
  - `TEAM_MEMBER_ENABLED`;
  - `PASSWORD_RESET`;
  - `PASSWORD_CHANGED`;
  - `PASSWORD_CHANGE_DENIED`;
  - `TEAM_MEMBER_ADMIN_DENIED`.

### Risks
- **Moving departments.** A user moved to another department keeps their existing clients and deals, which keep their old `department_id`, so the old head still sees them. Reassigning records is a separate action (owner reassignment already exists for clients and deals).
