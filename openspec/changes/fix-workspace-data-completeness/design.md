# Design

## Context

`WorkspaceProvider` loads 11 collections in one `Promise.allSettled` at sign-in. Deals and tasks use `listAll`; clients, documents, reports and alerts use `api.list` and get 25 rows. `DashboardPage` computes pipeline, task and KPI figures from those arrays. `/dashboard` already returns scoped metrics.

## Decisions

### 1. Loading
- `loadWorkspace({ quiet })` becomes a callback.
  - The sign-in effect calls it with `quiet: false`.
  - The refresh triggers call it with `quiet: true`, which never sets `dataStatus` to `loading` and never clears existing data when a request fails.
- Paginated resources use `listAll`: clients, deals, tasks, documents, reports and alerts.
  - `team`, `funnels`, `task-boards` and `achievements` return full arrays already.
  - `audit` loads one page of 100 for `DIRECTOR` and `MANAGER` only. The Audit screen keeps its own paging.
- `GET /dashboard` loads alongside the lists into `dashboardMetrics`. In demo mode, the metrics are derived locally from demo arrays with the same shape.
- A request counter drops responses from an earlier load that arrive after a newer one.

### 2. Refresh triggers
- An interval of 180 seconds runs only when `document.visibilityState === 'visible'`.
- On `focus` and `visibilitychange` to visible, the app refreshes if the last successful load is more than 60 seconds old.
- Mutations keep their optimistic local updates. A refresh simply overwrites them with server truth.
- Cost: each refresh is about 12 requests plus one per extra page. At 20 users and one refresh every 3 minutes, that is roughly 80 requests per minute per office. That is far below the new per-user limit, but it is why the per-IP limit had to change.

### 3. Dashboard
- The cards for clients, open and weighted pipeline, open deals, overdue tasks and people online read `dashboardMetrics`.
- Charts that need per-item detail (pipeline by stage, task lists) keep using the now-complete arrays.
- The KPI card keeps the user's own rating from `/team`.

### 4. Profile
- `PATCH /api/v1/team/me` accepts `{ fullName?: string(1..120), specialty?: string(0..120) | null }`. At least one field is required.
- The response is the public user. The change is audited as `PROFILE_UPDATED` with `metadata.fields`, never the values.
- `AuthContext.mergeCurrentUser` updates the session user, so the header avatar and name change at once.
- Access: any authenticated user, for their own row only. Role, department, job title and description stay with management (`add-user-administration`).

### 5. Rate limits (`middleware.ts`)
- `ipFloodLimiter`: 6,000 requests per 15 minutes per IP, mounted before the routers.
- `apiLimiter`: keyed by `user:<sub>` when the Bearer token verifies (signature only, no database call), otherwise `ip:<ip>`.
  - The limit is 1,500 for user keys and 300 for IP keys, through the `limit` function option.
  - The response stays 429 `RATE_LIMITED`.
- The webhook route (Telegram) stays mounted before both limiters.

### Access rules
No new data is exposed. `PATCH /team/me` touches only the caller.

### Migrations and audit
- No migration.
- New audit action: `PROFILE_UPDATED`.
