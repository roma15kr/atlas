# Design

## Context

- **Browser:** `apps/web/src/lib/activity.ts` hard-codes `IDLE_AFTER_MS = 5 min`. `AppContext` sends `presence:heartbeat { active }` every 60 seconds and as soon as the person goes idle (checked every 15 seconds).
- **Server:** `apps/api/src/presence.ts` uses `ACTIVE_TTL_SECONDS = 300` as the expiry when heartbeats stop arriving. That expiry is unrelated to idleness: an active tab beats every minute.

## Decisions

1. **The setting.** `PRESENCE_IDLE_MINUTES` in `config.ts`: an integer from 5 to 120, default 15. It is documented next to `IMAGE_UPLOADS_PER_HOUR`.
2. **The browser learns it from the socket.**
   - On connect the server emits `presence:config { idleMinutes }`, before the snapshot.
   - `trackActivity` takes the idle period as a parameter that can change, and starts at 15 minutes until the config arrives.
   - *Alternative rejected:* a build-time constant, which would need a release to change and would drift from the server.
3. **The server still trusts the browser's `active` flag.** Idleness is measured where the input happens. The heartbeat expiry (300 seconds) stays, so a sleeping laptop still goes offline after 5 minutes.
4. **History.** No backdating: OFFLINE is written when the person is shown offline, as today.

## Risks / Trade-offs

- **Attendance includes more idle time.** Attendance includes up to 15 idle minutes per pause instead of 5. That is accepted: the director asked for it, and the period can be lowered in Coolify.
- **Background tabs.** Chrome throttles timers in hidden tabs to about once a minute. That only delays the idle report by up to a minute, as today.
