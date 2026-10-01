# Proposal

## Why

Directors and managers can create accounts but can't do anything with them afterwards. The baseline audit found:
- Nobody can disable a user who leaves. Their account stays usable.
- Nobody can reset a forgotten password.
- Nobody can fix a typo in a name or job title.
- Nobody can move a person to another department or change their role.
- Users can't change their own password. The temporary password given at onboarding stays in use forever.

## What Changes

- **Edit a member.** `PATCH /api/v1/team/:id`.
  - A director can change anyone's full name, job title, specialty, job description, role and department.
  - A manager can change the full name, job title, specialty and job description of employees in their own department.
  - Nobody can change their own role.
  - The last active director can't be demoted.
- **Disable and enable.** `POST /api/v1/team/:id/disable` and `/enable`, with the same scope as editing.
  - Disabling revokes every refresh session, closes the user's open sockets and marks them offline.
  - The existing database triggers then take them out of chat channels and unassign their Telegram customers.
  - Nobody can disable themselves or the last active director.
  - Owned clients and deals stay as they are, visible to managers and directors.
- **Reset a password.** `POST /api/v1/team/:id/reset-password` with a new temporary password that meets the existing strength rule.
  - It clears any login lock, revokes all sessions, and makes the user change the password at next sign-in.
- **Change my own password.** `POST /api/v1/auth/password` with the current and the new password.
  - All other sessions are revoked, and the current browser gets a fresh session.
- **Forced change.** While a password change is required, the API answers every request except `/auth/*` with 403 `PASSWORD_CHANGE_REQUIRED`. The web app shows a change-password screen right after sign-in.
- **Directory.** Directors and managers can list disabled members with `GET /team?status=all` to re-enable them.
- **Team screen.** The member panel gets "Изменить", "Сбросить пароль" and "Отключить"/"Включить" actions, each in a dialog, plus a "Отключённые" filter. The profile screen gets "Изменить пароль".

## Capabilities

### Modified Capabilities
- `team-management`: edit, disable/enable, reset password, directory with disabled members.
- `identity-access`: own password change and the forced change after a reset.
- `audit-log`: account administration events.
- `web-workspace`: forced password change screen.

## Impact

- **Database:** migration `009_user_administration.sql` adds `users.must_change_password` and `users.password_changed_at`.
- **API:** `routes/team.ts`, `routes/auth.ts`, `auth.ts` (forced-change guard), `realtime.ts` (`disconnectUser`), `access.ts` (manageability rules).
- **Web:** `TeamPage` member actions and dialogs, `ProfilePage` password dialog, a `ChangePasswordPage` gate in `App.tsx`, `AppContext` actions.
