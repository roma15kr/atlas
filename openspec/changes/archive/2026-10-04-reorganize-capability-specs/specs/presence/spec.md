# Spec Delta

## ADDED Requirements

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

### Requirement: Monitoring consent notice
The dashboard SHALL show a notice with a link to the profile to users who have not accepted the current monitoring policy version.

#### Scenario: New employee
- **WHEN** an employee without consent opens the dashboard
- **THEN** a notice explains the policy and links to the profile, where it can be accepted
