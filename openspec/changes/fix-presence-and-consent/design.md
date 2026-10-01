# Design

## Context

- `presence.ts` keeps `presence:<user>` (an ONLINE state with a 300-second TTL) in Redis, or in a local map without Redis.
- `socket.ts` calls `markOnline` on connect and on each heartbeat, `markOffline` on any disconnect, and inserts an ONLINE or OFFLINE `presence_events` row per socket.
- The web app sends a heartbeat every 45 seconds, and on focus and visibility changes.

## Decisions

### 1. Connection set
- Redis sorted set `presence:sockets:<user>`, where the member is the socket id and the score is the expiry in milliseconds (now + 150 s).
- On connect and on every heartbeat, `ZADD` the socket and `PEXPIRE` the set to 300 s.
- On disconnect, `ZREM`.
- `liveSockets(user)` runs `ZREMRANGEBYSCORE -inf now`, then `ZCARD`.
- Without Redis, it is a `Map<user, Map<socketId, expiry>>` with the same semantics.

### 2. Activity state
- `presence:<user>` stays the "active" state with a 300-second TTL, so the snapshot and team API keep their shape.
- Heartbeat payload: `{ active: boolean }`. A missing value is treated as `true` for older clients.
- `applyActivity(user, active)`:
  - **active:** set the state with a 300 s TTL. If there was no state before, it is a transition to ONLINE.
  - **not active:** delete the state. If there was one, it is a transition to OFFLINE.
- **On connect:** register the socket and treat the connection as `active: true`, because the user just opened Atlas.
- **On disconnect:** remove the socket. If `liveSockets` is 0 and the state exists, delete it and record OFFLINE.
- **Expiry without a disconnect** (laptop sleep): the state simply ages out after 300 s. The next `applyActivity(true)` sees no prior state and records ONLINE. A `TIMEOUT` row is written at that moment, with `occurred_at` = the previous state's `lastSeenAt` stored in `presence:last:<user>`, so attendance is closed correctly.
- Concurrency: the read-then-write runs in a Redis `MULTI` with a `GET` before it, which is acceptable at this scale. A duplicated transition causes at most one extra event.

### 3. Transitions → broadcast and history
- Only transitions emit `presence:changed`, to the same audience rooms as today, and write `presence_events`.
- History is written only when `users.monitoring_consent_at IS NOT NULL` and `monitoring_consent_version` equals the current `MONITORING_POLICY_VERSION`, which is `2026-01` as in the web app. The check is a single `INSERT ... SELECT ... WHERE EXISTS (consenting user)`, so it needs no extra round trip.
- `session_id` holds the socket id that caused the transition.

### 4. Web activity tracker (`lib/activity.ts`)
- **Listeners:** `pointerdown`, `keydown`, `wheel`, `touchstart`, and `mousemove` throttled to once per 10 s. They update `lastActivity` in memory and `localStorage['atlas.lastActivity']`, throttled to once per 15 s, wrapped in try/catch.
- `isActive()` = `now - max(memory, storage) < 5 min`. Becoming visible counts as activity.
- `AppContext` sends `presence:heartbeat { active }`:
  - every 60 s;
  - immediately when `isActive()` flips, checked every 15 s;
  - on the first activity after idle.

### 5. Consent-gated metrics
- **`ai.ts` `systemMetrics`:** when the target has no current consent, `presence` is `{ consent: false }` and the rule-based text says activity isn't analyzed. Claude receives the same object.
- **`reportMetrics`:**
  - a person's report has `attendance.consent = false` and no day counts when the target has no consent;
  - a team report counts only consenting users' events and adds `attendance.consentingUsers` and `attendance.teamSize`.
- **Web:** shows "нет согласия" instead of 0 where `consent === false`.

### 6. Consent notice
- `DashboardPage` shows a `Surface` notice with a warning badge, the policy summary, and a "Перейти в профиль" button when `session.user.monitoringConsentAt` is null or the version differs.

### Access rules
Unchanged. Live presence keeps the role-scoped audience.

### Migrations and audit
- No migration.
- No new audit events. Consent acceptance and withdrawal are already audited.
