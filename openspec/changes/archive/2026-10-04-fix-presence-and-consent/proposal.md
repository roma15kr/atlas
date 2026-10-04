# Proposal

## Why

The baseline audit found that the green "в сети" dot and the attendance figures can't be trusted, and that the monitoring policy isn't enforced:
- **Closing one of several tabs marks the person offline.** The server marks a user offline on any socket disconnect, even while another tab stays open.
- **"Online" means "a tab is open", not "working".** The heartbeat fires every 45 seconds whether or not the person touches the computer. The brief asked for a person to turn red after 5 minutes of inactivity.
- **Consent is recorded but never checked.** Presence history, attendance in reports and the AI's activity metrics are collected for everyone, whether or not they accepted the monitoring policy. The brief treats consent as a legal requirement.

## What Changes

- **Several tabs and devices.** A user stays online while any of their connections is open and active. Only closing the last one, or 5 minutes of inactivity, turns them offline.
- **Inactivity.**
  - The browser tracks keyboard, mouse, scroll and touch activity, shared across the user's tabs.
  - Every 60 seconds it tells the server whether the user was active in the last 5 minutes.
  - After 5 idle minutes the user turns offline within about 15 seconds, and turns online again on the next activity.
  - A sleeping or frozen browser expires after 5 minutes as today.
- **Fewer, real events.** `presence:changed` and presence history entries are produced only when a user's state actually changes, not for every socket and heartbeat.
- **Consent enforcement.**
  - Presence history is recorded only for users who have accepted the current monitoring policy.
  - Attendance in reports and activity in AI analysis are given only for consenting users; for others they are marked "no consent" rather than shown as 0.
  - The `INACTIVITY` alert rule (from `add-alert-rules-and-scheduled-reports`) already skips non-consenting users.
  - Live online/offline status stays visible to managers for everyone, because it is not stored.
- **Consent prompt.** Users who haven't accepted the policy see a notice on the dashboard linking to the profile, where they can accept it.

## Capabilities

### Modified Capabilities
- `presence`: connection tracking, inactivity, transition-only events, consent-gated history.
- `web-workspace`: activity tracking, heartbeat payload and the consent notice.
- `alerts-ai`: consent-gated activity metrics.
- `reports`: consent-gated attendance.

## Impact

- **API:** `presence.ts` (connection sets and transitions), `socket.ts`, `ai.ts`, `routes/reports.ts`, `routes/team.ts` (the consent change re-evaluates the socket's recording).
- **Web:** `context/AppContext.tsx` (activity tracker, heartbeat), a new `lib/activity.ts`, and `DashboardPage` (consent notice).
- **Database:** no migration. The existing `presence_events.event` values `ONLINE` and `OFFLINE` are used, and `TIMEOUT` is used when an expired user is noticed.
