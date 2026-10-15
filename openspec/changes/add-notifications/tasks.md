# Tasks

## 1. Tracer bullet: assigning a task notifies the assignee on the bell

- [x] 1.1 Add `database/020_notifications.sql` (notifications, push_subscriptions, notification_preferences, task_due_notices), `notifications/notify.ts`, the list/read/read-all endpoints and `notification:new`, and hook `TASK_ASSIGNED` in task create/update. Verify a new `notifications.integration.test.ts`: an assignee gets one unread notification with a link, the actor gets none, another user can't read or mark it (404), read-all clears the count. Commit.
- [ ] 1.2 Replace the bell's navigation with the notification panel (list, unread marks, click opens the link and marks read, «Прочитать все», live updates) with a demo branch. Verify `NotificationBell.test.tsx` cases; commit.

## 2. The other events

- [ ] 2.1 Tasks: `TASK_COMMENTED`, and the scheduler step for `TASK_DUE`/`TASK_OVERDUE` (once, after 08:00 Kyiv) plus 90-day cleanup. Personal-task visibility is respected. Verify the cases; commit.
- [ ] 2.2 Chat: `CHAT_DIRECT` (not for muted DMs) and `CHAT_MENTION` via the existing mention rules. Telegram: `TELEGRAM_MESSAGE` to the responsible person, collapsed per contact. Verify the cases (an outsider of a chat or a colleague's customer gets nothing); commit.
- [ ] 2.3 `ALERT_CREATED` by `alertVisibility`, `DEAL_ASSIGNED`/`CLIENT_ASSIGNED` to the new owner. Verify the cases; commit.

## 3. Desktop notifications

- [ ] 3.1 Add `web-push`, VAPID config (disabled without keys), subscription and preference endpoints with audit, the async sender (drops 404/410 and repeatedly failing subscriptions), the test endpoint, and ADR `0005-web-push-notifications.md`. Verify the integration cases with a stubbed sender (group preference respected, gone subscription deleted, disabled without keys); commit.
- [ ] 3.2 Add `public/sw.js` (skip when focused, click opens the link), Nginx `no-cache` for it, and «Профиль → Уведомления» (status, enable/disable, groups, test). Verify the `ProfileNotifications.test.tsx` cases with mocked `Notification`/`PushManager`; commit.

## 4. Integration checks

- [ ] 4.1 Run `make check` and `npm run build`; verify both pass.
- [ ] 4.2 Run `npx openspec validate add-notifications --strict`; verify it passes.

## Workflow follow-up

- Generate VAPID keys and set them in Coolify (prod and dev; I do it through the API, the human confirms).
- PR into `dev`, check on atlas-dev (pop-up with the tab closed); `dev` → `main`; live check; archive; update `docs/ARCHITECTURE.md` (new module) and `docs/external/README.md` (VAPID settings).
