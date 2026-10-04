# web-workspace Specification

## Purpose
Delivers the Russian-first, desktop-Chrome React workspace: sign-in, role-gated navigation, the dashboard, CRM, sales and task boards, documents, team, reports, achievements, messages, audit and profile screens, served from one origin behind Nginx.

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

### Requirement: Live presence in the UI
The web app SHALL open an authenticated Socket.IO connection and apply `presence:snapshot` and `presence:changed` events to the team list.
- It SHALL track keyboard, mouse, scroll and touch activity, shared across the user's tabs.
- It SHALL send `presence:heartbeat` with `active`, meaning activity within the last 5 minutes, every 60 seconds.
- It SHALL also send a heartbeat immediately when the user becomes idle or active again.

#### Scenario: Colleague comes online
- **WHEN** a `presence:changed` event marks a visible colleague ONLINE
- **THEN** their indicator turns green without reloading

#### Scenario: Activity in another tab
- **WHEN** the user works in one Atlas tab while another Atlas tab is in the background
- **THEN** both tabs report `active: true`

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

### Requirement: Honest profile screen
The profile screen SHALL save only through the API and SHALL NOT show controls for settings that Atlas does not implement.

#### Scenario: Saving the profile
- **WHEN** a user changes their full name and clicks "Сохранить"
- **THEN** `PATCH /api/v1/team/me` is called, the sidebar shows the new name, and a server error is shown if the save fails

### Requirement: Password change screens
The web app SHALL:
- offer "Изменить пароль" on the profile screen;
- show only a change-password screen while the session requires a password change, replacing the session after a successful change.

#### Scenario: Forced change after reset
- **WHEN** a user whose password was reset signs in
- **THEN** every route shows the change-password screen until the change succeeds, then the dashboard opens

### Requirement: KPI editing on the team screen
The team screen SHALL let users who may manage a member's KPIs add, edit and delete them in dialogs.
- Automatic KPIs SHALL be marked as such, and SHALL NOT offer an actual-value field.
- Users who can't manage KPIs SHALL see them read-only.

#### Scenario: Employee views own KPIs
- **WHEN** an EMPLOYEE opens their panel on the team screen
- **THEN** KPIs are listed without add, edit or delete actions

### Requirement: Monitoring consent notice
The dashboard SHALL show a notice with a link to the profile to users who have not accepted the current monitoring policy version.

#### Scenario: New employee
- **WHEN** an employee without consent opens the dashboard
- **THEN** a notice explains the policy and links to the profile, where it can be accepted

### Requirement: Editable personal profile
The profile screen SHALL let the user upload, replace and remove a photo and edit their date of birth, phone, contact email, city, "about" text and birthday visibility. It SHALL send only the changed fields and show Russian validation messages.
- Before upload, the browser SHALL crop the photo to a square and re-encode it at 512×512, which removes camera metadata.

#### Scenario: Uploading a photo
- **WHEN** a user picks a 4000×3000 phone photo
- **THEN** a 512×512 JPEG is uploaded and the new photo appears in the profile and in the sidebar without a reload

#### Scenario: Invalid email
- **WHEN** the user enters "anna@" as the contact email and saves
- **THEN** no request is sent and the field shows "Укажите корректный email"

### Requirement: Photos and contacts across the workspace
The web app SHALL show a member's photo wherever it shows their avatar, falling back to initials when there is no photo or it fails to load. The Team panel SHALL show the member's phone, contact email, city, visible birthday (day and month) and "about" text.

#### Scenario: Photo fails to load
- **WHEN** a photo URL returns 404
- **THEN** the avatar shows the person's initials

### Requirement: Job description editor
The Team panel SHALL always show the member's "Должностная инструкция" card. People who may edit the member SHALL see "Заполнить" or "Изменить", which opens a dedicated editor with a 20,000-character counter, an insertable section template and a note that AI recommendations use the text. The team list SHALL mark members the viewer manages who have no description. The profile SHALL show the person their own description, or a note that their manager fills it in.

#### Scenario: Head fills in a missing description
- **WHEN** a head opens an employee marked "Нет инструкции", clicks "Заполнить", inserts the template, edits it and saves
- **THEN** the card shows the text and the badge disappears

#### Scenario: Employee views their profile
- **WHEN** an employee without a description opens the profile
- **THEN** they see "Не заполнена — заполняет руководитель" and no edit control
