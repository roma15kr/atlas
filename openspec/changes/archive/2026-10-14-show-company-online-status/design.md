# Design

## Context

- **Presence today** goes only to the person, directors and the heads of their department:
  - `presence:changed` carries `status` and `lastSeenAt` to the rooms `presence:user`, `presence:directors` and `presence:managers`;
  - `presence:snapshot` covers `visibleUserIds`.
- **The directory** (`GET /team/directory`) has no presence.
- **The Team page** builds rows from the scoped `users` (with `online`, `lastSeen`) and directory colleagues (no presence). Its tabs filter only `users`.

## Decisions

1. **The directory carries `online`.** `GET /team/directory` adds `online: boolean` from `presenceFor` (Redis or memory, as for `/team`). It still never carries `lastSeenAt`.
2. **A company-wide event without times.**
   - Every socket joins `presence:company:<companyId>`.
   - On each transition the server also emits `presence:online { userId, online }` to that room. The existing scoped event is unchanged.
   - *Alternative rejected:* widening `presence:changed`, which carries `lastSeenAt`.
3. **Web.**
   - The Team page keeps the directory in state and listens to `presence:online` through the existing `atlas:socket` window events, updating `online` in the directory entries.
   - Team members keep their full state from `users`.
   - Rows and the tabs use one `online` value for everyone. Colleagues show the dot and «В сети»/«Не в сети»; team members keep «N мин назад».
   - Selection falls back to the first visible row when the selected person is filtered out.
4. **Demo.** `teamDirectory()` copies `online` from the demo users.

## Risks / Trade-offs

- **Colleagues see who is in Atlas now.** This is what was asked for. Times and history stay scoped, so nobody outside the team can reconstruct anyone's working hours.
- **One more small event per transition** goes to every company socket (about 40 sockets): negligible.
