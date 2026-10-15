# Design

## Context

- **No notification store exists.** The bell (`AppShell.tsx`) navigates to «/» and shows the open-alert count.
- **Realtime:** `emitToUsers(userIds, event, payload)` (`realtime.ts`) reaches every socket of a user. Chat already emits `chat:mention`.
- **Automation:** `automation/scheduler.ts` runs steps on an interval under an advisory lock, and the alert rules live there.
- **Visibility rules exist per area:** `taskAccessSql` (including personal tasks), chat membership, `telegramAccessSql`/responsible, `alertVisibility`, `dealScope`/`recordScope`.
- **The web holds the access token in memory only,** and the refresh cookie is httpOnly.

## Decisions

1. **One module creates notifications.** `notifications/notify.ts` exposes `notify(recipients, { kind, title, body, link, entityType, entityId, collapseKey?, actorId })`. It:
   - drops the actor and inactive users, and keeps only users of the same company;
   - inserts rows, or updates the unread row with the same `(user_id, collapse_key)` (Telegram bursts);
   - emits `notification:new` to the user's room, and queues Web Push for users whose preference allows that group.

   Callers pass recipients that are already filtered by visibility. Each hook uses the area's own access helper with an `AuthContext` built for the recipient (`authForUser`).

2. **Data** (migration `020_notifications.sql`):
   - **`notifications`:** `id, company_id, user_id, kind, title, body, link, entity_type, entity_id, collapse_key, created_at, read_at`, indexed on `(user_id, read_at, created_at desc)`.
   - **`push_subscriptions`:** `id, user_id, endpoint UNIQUE, p256dh, auth, user_agent, created_at, last_success_at, failures`.
   - **`notification_preferences`:** `user_id PK`, plus booleans `push_tasks`, `push_chat`, `push_telegram`, `push_alerts`, all default true.
3. **Kinds and groups:**

   | Kind | Group | Trigger | Recipients |
   |---|---|---|---|
   | `TASK_ASSIGNED` | tasks | create or update adds assignees | the new assignees |
   | `TASK_COMMENTED` | tasks | a comment is posted | author and assignees who can see the task |
   | `TASK_DUE` | tasks | scheduler | assignees of open tasks due today |
   | `TASK_OVERDUE` | tasks | scheduler | assignees of open tasks past due, once per task |
   | `CHAT_DIRECT` | chat | a DM message | the other members of a non-muted DM |
   | `CHAT_MENTION` | chat | a mention | as decided by the existing mention rules |
   | `TELEGRAM_MESSAGE` | telegram | an inbound customer message | the responsible person (else heads covering the contact), collapsed per contact |
   | `ALERT_CREATED` | alerts | an alert is created | users for whom `alertVisibility` admits it |
   | `DEAL_ASSIGNED`, `CLIENT_ASSIGNED` | alerts | owner set to someone else by another user | the new owner |

   - **Due and overdue:** a daily step at the first tick after 08:00 Kyiv time. A `task_due_notices (task_id, kind, sent_on)` key, kept in the same migration, makes it idempotent.
4. **API, own notifications only** (another user's id answers 404):
   - `GET /api/v1/notifications?limit&before&unread=true` returns `{ data, meta: { unreadCount } }`.
   - `POST /api/v1/notifications/:id/read` and `POST /api/v1/notifications/read-all`.
   - `GET/PATCH /api/v1/notifications/preferences`.
   - `GET /api/v1/notifications/push/config` returns `{ enabled, publicKey }`; it is "disabled" without VAPID keys.
   - `POST /api/v1/notifications/push/subscriptions` (upsert by endpoint, assigned to the caller) and `DELETE /api/v1/notifications/push/subscriptions` (by endpoint).
   - `POST /api/v1/notifications/push/test`.
   - All roles have the same rights over their own data.
   - Audit: `PUSH_SUBSCRIBED`/`PUSH_UNSUBSCRIBED` with the subscription id; `NOTIFICATION_PREFERENCES_UPDATED` with field names.
5. **Web Push.**
   - The `web-push` library, with keys from config.
   - Payload: `{ id, title, body (≤120 chars, plain text via the rich-text plain helper), link, tag: collapseKey ?? id }`.
   - Sent asynchronously after commit, so it never blocks the request.
   - Retry: no extra retry on 5xx. A `404/410` deletes the subscription; 5 consecutive failures delete it too.
   - TTL is 24 h.
6. **Service worker** (`apps/web/public/sw.js`, scope `/`):
   - **`push`:** if a focused Atlas window exists, it skips the pop-up (the bell updates live); otherwise it calls `showNotification` with the icon and tag.
   - **`notificationclick`:** focuses an Atlas window and navigates it to `link`, or opens one.
   - Nginx serves `sw.js` with `Cache-Control: no-cache`. The CSP needs no change (same origin).
   - The service worker never sees the access token.
7. **Web.**
   - **Bell:** `NotificationBell` opens a popover with the list, «Прочитать все» and a «Настройки» link. The badge shows the unread count (alerts become notifications, so the old alert count goes). `notification:new` arrives over the shared socket (`atlas:socket` events).
   - **Profile, «Уведомления» section:**
     - status: not supported, blocked by the browser, off, or on in this browser;
     - «Включить» registers `sw.js`, asks permission, subscribes with the public key and posts the subscription; «Отключить» unsubscribes and deletes it;
     - four group toggles and «Проверить».
   - **Demo:** an in-memory list seeded with a few notifications. Push shows as unavailable.
8. **Cleanup.** The daily step deletes notifications older than 90 days and `task_due_notices` older than 30 days.

## Risks / Trade-offs

- **Google's push service relays encrypted payloads.** It can't read them, and previews are short. Accepted.
- **Hooks in many routes.** Each is a single `notify` call after the write, covered by integration tests. A notify failure is logged and never fails the user's request.
- **Chrome must be running for pop-ups.** That is the platform's limit; the bell keeps everything.
