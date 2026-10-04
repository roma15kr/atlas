# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
