# Proposal

## Why

The baseline audit (2026-09) found that the workspace shows wrong or stale numbers. The deals and tasks lists were fixed along the way, but these problems remain:

- **Truncated lists.** Clients, documents, reports and alerts load only the API's default page of 25 rows. CRM search only searches those 25.
- **Totals summed in the browser.** Dashboard totals come from those partial lists. The `/api/v1/dashboard` endpoint computes the correct scoped totals but is never called.
- **Stale data.** Data loads once at sign-in. A manager sees no new deals, tasks or alerts from colleagues until they sign in again.
- **Fake profile settings.**
  - "Сохранить" shows "Сохранено" without saving anything.
  - The notification and presence switches do nothing.
  - "Изменить пароль" and "Настроить 2FA" are dead buttons.
- **Shared-office rate limit.** The API allows 500 requests per 15 minutes per IP address. The whole office shares one IP behind NAT, and periodic refresh adds requests, so normal use could start hitting 429 errors.
- **Pointless request.** Every employee's browser asks for the audit log and gets 403 back.

## What Changes

- **Full lists.** The web app loads every paginated list in full, following `limit`/`offset` until `meta.total` is reached. This covers clients, documents, reports and alerts, as it already does for deals and tasks.
- **Server totals.** The dashboard's numbers come from `GET /api/v1/dashboard`: clients, open and weighted pipeline in UAH, open deals, total, overdue and done tasks, people online, and team size.
- **Automatic refresh.**
  - The app re-fetches its data every 3 minutes while the tab is visible, and when the window regains focus if the data is older than 60 seconds.
  - A refresh replaces the data quietly, without a loading state.
  - A failed refresh keeps the data already shown.
- **Real profile editing.**
  - New `PATCH /api/v1/team/me` lets a user change their own full name and specialty, audited as `PROFILE_UPDATED`.
  - The profile screen saves through it and shows server errors.
  - The fake switches and the 2FA button are removed. Password change arrives with `add-user-administration`.
- **Audit loading by role.** Only directors and managers load the audit log, the roles the API allows.
- **Rate limiting by person.**
  - Authenticated requests are limited per user: 1,500 per 15 minutes.
  - Anonymous requests stay limited per IP: 300 per 15 minutes.
  - A separate per-IP ceiling of 6,000 requests per 15 minutes stays as flood protection.
  - The login limit and the CRM read limit are unchanged.

## Capabilities

### Modified Capabilities
- `web-workspace`: data loading (full lists, role-aware audit, periodic refresh) and server-side dashboard totals.
- `identity-access`: API rate limiting per user.
- `team-management`: self-service profile update.
- `audit-log`: `PROFILE_UPDATED`.

## Impact

- **API:** `middleware.ts` (limiters), `app.ts`, `routes/team.ts` (`PATCH /me`).
- **Web:** `context/AppContext.tsx` (loading and refresh, `updateProfile`), `pages/DashboardPage.tsx`, `pages/ProfilePage.tsx`, `lib/api.ts`.
- **Database:** no migration.
