# Proposal

## Why

The baseline audit found three features that look finished but never work in production:
- **Alerts.** No code creates an alert. The dashboard's "AI observations" panel and the alerts feed stay empty, and `docs/ARCHITECTURE.md` describes "background policy checks" that don't exist.
- **Scheduled reports.** A report can be saved as DAILY, WEEKLY or MONTHLY, but nothing ever runs it again. The schedule is only a label. The list's schedule filter does nothing, and there is no way to read a report's results in the UI.
- **AI analysis.** `POST /api/v1/ai/analyze` works and is audited, but no screen calls it.

## What Changes

- **Alert rules.** The automation scheduler from `add-kpi-management` evaluates rules every 10 minutes and creates alerts:
  - `TASKS_OVERDUE`: a person has 3 or more open assigned tasks past due. It is WARNING, and CRITICAL from 6.
  - `DEAL_CLOSE_OVERDUE`: an open deal's expected close date has passed (WARNING).
  - `DEAL_STALLED`: an open deal hasn't changed for 14 days (INFO).
  - `KPI_BEHIND`: more than half of a KPI's period has passed and its progress is more than 30 points behind the elapsed share (WARNING).
  - `INACTIVITY`: a person who accepted the monitoring policy hasn't been online for 3 working days (INFO). Without consent, this rule never looks at them.
- **No duplicates.** Each condition holds at most one unresolved alert. When the condition clears, the alert is marked resolved automatically. Acknowledging it hides nothing; it records who reviewed it.
- **Deal alerts follow deal access.** An alert about a deal is shown only to people who can see that deal, including its funnel restrictions.
- **The alert feed** shows unresolved alerts by default, with `state=all` for history.
- **Scheduled reports.**
  - A recurring report runs at 06:00 Kyiv time: daily for the previous day, weekly on Monday for the previous week, monthly on the 1st for the previous month.
  - Each run is kept in the report's history, and the report shows its latest result.
  - Reports can be paused, resumed and deleted by their creator or a director. A manager can do so for their department's reports.
  - If the creator is disabled or can no longer create reports, the schedule pauses itself.
- **Reports screen.**
  - A working schedule filter.
  - A result dialog with the figures.
  - The history of runs.
  - Pause, resume and delete.
- **AI analysis in the UI.** "AI-анализ" on a member's panel (directors and heads, for people they manage) and on the profile (the user for themselves). It opens a dialog with three modes, Совет, Оценка and Прогноз, and shows the summary, the recommendations and whether Claude or the built-in rules produced them.

## Capabilities

### Modified Capabilities
- `alerts-ai`: alert rules, deduplication and resolution, deal-aware feed, and the AI analysis screens (the "AI-анализ" dialog on the member panel and the profile).
- `reports`: recurring runs, run history, pause, resume and delete, and the report results screen with its history view.
- `audit-log`: report schedule events.

## Impact

- **Database:** migration `011_alert_rules_reports.sql`, covering alert columns, report schedule columns and `report_runs`.
- **API:**
  - new `automation/alerts.ts` and `automation/reports.ts`, registered in the scheduler;
  - changes to `routes/alerts.ts`, `routes/reports.ts` (exports `reportMetrics`) and `routes/dashboard.ts` (open alerts only).
- **Web:** `ReportsPage`, a new `components/AiAnalysisDialog.tsx`, `TeamPage`, `ProfilePage`, `DashboardPage` (alert rule labels), `AppContext` and `types`.
- **Depends on** `add-kpi-management` (scheduler and KPI periods).
