# Tasks

## 1. API

- [x] 1.1 Add per-user `apiLimiter` and `ipFloodLimiter` in `middleware.ts` and wire them in `app.ts`. Verify with tests: user keys get 1,500, anonymous IP keys get 300, two users from one IP are counted separately, and the limit returns 429 `RATE_LIMITED`.
- [x] 1.2 Add `PATCH /api/v1/team/me` for full name and specialty, audited as `PROFILE_UPDATED`. Verify with tests: an employee updates their own name, an empty body gives 400, and role or department fields are rejected.

## 2. Web

- [x] 2.1 Load every paginated list through `listAll`, load the audit log only for directors and managers, and load `/dashboard` metrics. Verify with a unit test that a 230-row list is fully loaded, and that an employee session does not request `/audit`.
- [x] 2.2 Quiet refresh: every 3 minutes while visible, on focus when the data is older than 60 seconds, and keeping the data on failure. Verify with fake-timer tests.
- [x] 2.3 Dashboard cards read server metrics. Verify with a test that the cards show `/dashboard` totals, not array sums.
- [x] 2.4 Profile saves through `PATCH /team/me`, and the fake switches and 2FA button are removed. Verify with a test that saving calls the API and the sidebar name updates.

## 3. Verification

- [x] 3.1 Run `npm run typecheck && npm test && npm run build` and `openspec validate fix-workspace-data-completeness --strict`.
- [x] 3.2 On the test app:
  - the CRM shows more than 25 clients after creating 30 test clients;
  - the dashboard totals match `/dashboard`;
  - a deal created by a colleague appears within 3 minutes without reloading;
  - a profile name change persists.
