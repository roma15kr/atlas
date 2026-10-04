# web-workspace Specification

## Purpose
The shared shell of the Russian-first React workspace, served from one origin behind Nginx: sign-in and session handling, role-gated navigation, loading and refreshing workspace data, demo mode, and dashboard totals. Feature screens are specified with their feature (for example the profile in team-management and KPI editing in performance-rating); the look and feel is in ui-design-system.

## Requirements

### Requirement: Session handling
The web app SHALL sign in through the API and keep the access token and user profile only in memory. It SHALL persist nothing but a signed-in hint, which it uses to restore the session on page load through the refresh cookie.
- It SHALL send the token as a Bearer header.
- On a 401, it SHALL transparently refresh once using the refresh cookie, sharing a single in-flight refresh within the tab and serializing refreshes across tabs.
- It SHALL return to the login screen when refresh fails.

#### Scenario: Expired access token
- **WHEN** an API call returns 401 and the refresh succeeds
- **THEN** the call is retried once with the new token without user action

#### Scenario: Refresh fails
- **WHEN** the refresh call is rejected
- **THEN** the in-memory session and the hint are cleared and the user is sent to `/login`

#### Scenario: Page reload
- **WHEN** a signed-in user reloads the page
- **THEN** the session is restored through `/auth/refresh` without showing the login screen, and no access token is found in browser storage

#### Scenario: Two tabs refresh at once
- **WHEN** two tabs of the same user need a refresh at the same moment
- **THEN** the refreshes run one after the other and both tabs stay signed in

### Requirement: Role-gated navigation
The web app SHALL show the Reports screen only to DIRECTORs and MANAGERs and the Audit screen only to DIRECTORs, redirecting other roles to the dashboard. The API remains the authority for every permission.

#### Scenario: Employee opens reports URL
- **WHEN** an EMPLOYEE navigates to `/reports`
- **THEN** they are redirected to `/`

### Requirement: Workspace data loading
After sign-in, the web app SHALL load these collections in parallel: team, clients, deals, funnels, task boards, tasks, documents, reports, alerts, achievements and the dashboard metrics.
- For paginated resources, it SHALL follow `limit`/`offset` until every row the user may see is loaded.
- It SHALL request the audit log only for DIRECTORs and MANAGERs.
- It SHALL tolerate individual failures, and show the offline state only when every request fails.

#### Scenario: More rows than one page
- **WHEN** a director can see 230 clients
- **THEN** all 230 clients are loaded and CRM search finds any of them

#### Scenario: Employee without audit access
- **WHEN** an EMPLOYEE signs in
- **THEN** no request is made to `/api/v1/audit`, and all other sections load

### Requirement: Demo mode isolation
The web app SHALL use built-in demo data and demo sessions only in development builds or when `VITE_DEMO_MODE=true`, and only when the API is unreachable or returns a server error; demo sessions SHALL never call the API or open a socket.

#### Scenario: Production build with API rejection
- **WHEN** a production build receives 401 for a demo password
- **THEN** the login fails and no demo session is created

### Requirement: Automatic workspace refresh
The web app SHALL re-load workspace data:
- every 3 minutes while the tab is visible;
- when the window regains focus or becomes visible, if the last successful load is older than 60 seconds.

A refresh SHALL NOT show a loading state, and SHALL keep the data already shown when it fails.

#### Scenario: Colleague creates a deal
- **WHEN** a colleague in the manager's department creates a deal and 3 minutes pass with the manager's tab visible
- **THEN** the deal appears on the manager's sales board without reloading the page

#### Scenario: Refresh fails
- **WHEN** a background refresh gets a network error
- **THEN** the previously loaded data stays on screen

### Requirement: Server-side dashboard totals
The dashboard SHALL show the totals returned by `GET /api/v1/dashboard`, scoped to the viewer: client count, open and weighted pipeline in UAH, open deals, task totals with overdue and done counts, people online, and team size. It SHALL NOT sum them from client-side lists.

#### Scenario: Pipeline total
- **WHEN** the dashboard renders for a director
- **THEN** the pipeline card shows `metrics.pipelineValue` from `/dashboard`
