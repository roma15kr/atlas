# web-workspace Specification

## Purpose
Delivers the Russian-first, desktop-Chrome React workspace: sign-in, role-gated navigation, the dashboard, CRM, sales and task boards, documents, team, reports, achievements, messages, audit and profile screens, served from one origin behind Nginx.

## Requirements

### Requirement: Session handling
The web app SHALL sign in through the API, keep the access token and user profile in browser storage, send the token as a Bearer header, transparently refresh once on a 401 using the refresh cookie (sharing a single in-flight refresh), and return to the login screen when refresh fails.

#### Scenario: Expired access token
- **WHEN** an API call returns 401 and the refresh succeeds
- **THEN** the call is retried once with the new token without user action

#### Scenario: Refresh fails
- **WHEN** the refresh call is rejected
- **THEN** the stored session is cleared and the user is sent to `/login`

### Requirement: Role-gated navigation
The web app SHALL show the Reports screen only to DIRECTORs and MANAGERs and the Audit screen only to DIRECTORs, redirecting other roles to the dashboard. The API remains the authority for every permission.

#### Scenario: Employee opens reports URL
- **WHEN** an EMPLOYEE navigates to `/reports`
- **THEN** they are redirected to `/`

### Requirement: Workspace data loading
After sign-in the web app SHALL load team, clients, deals, deal stages, tasks, documents, reports, alerts, achievements, integrations, messages and audit data in parallel, tolerate individual failures (for example 403 on audit for employees), and show an offline state only when every request fails.

#### Scenario: Employee without audit access
- **WHEN** the audit request returns 403 for an EMPLOYEE
- **THEN** all other sections still load

### Requirement: Live presence in the UI
The web app SHALL open an authenticated Socket.IO connection, apply `presence:snapshot` and `presence:changed` events to the team list, and send `presence:heartbeat` every 45 seconds and whenever the window gains focus or visibility changes.

#### Scenario: Colleague comes online
- **WHEN** a `presence:changed` event marks a visible colleague ONLINE
- **THEN** their indicator turns green without reloading

### Requirement: Demo mode isolation
The web app SHALL use built-in demo data and demo sessions only in development builds or when `VITE_DEMO_MODE=true`, and only when the API is unreachable or returns a server error; demo sessions SHALL never call the API or open a socket.

#### Scenario: Production build with API rejection
- **WHEN** a production build receives 401 for a demo password
- **THEN** the login fails and no demo session is created

### Requirement: Director-only export control
The CRM screen SHALL download the full client CSV through the authenticated export endpoint and show the server's refusal message to non-directors.

#### Scenario: Director downloads export
- **WHEN** a DIRECTOR clicks export
- **THEN** the CSV returned by `/api/v1/clients/export.csv` is saved by the browser
