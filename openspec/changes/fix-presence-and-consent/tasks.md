# Tasks

## 1. API

- [x] 1.1 `presence.ts`: connection set, `applyActivity`, transitions, and the local fallback. Verify with unit tests on both backends:
  - two sockets, one disconnects: still online;
  - an inactive heartbeat: offline;
  - an expired state then activity: a TIMEOUT and an ONLINE recorded once.
- [x] 1.2 `socket.ts`: the heartbeat payload, transition-only broadcast, and consent-gated history. Verify with socket.io-client tests: a second tab doesn't duplicate events, a non-consenting user's transitions write no rows, and a consenting user's do.
- [x] 1.3 `ai.ts` and `reportMetrics` consent gating. Verify with tests: a target without consent gets `consent: false`, and a team report counts consenting users only.

## 2. Web

- [x] 2.1 `lib/activity.ts` and the heartbeat wiring. Verify with fake-timer tests: idle after 5 minutes sends `active: false`, activity in another tab (via storage) keeps a tab active, and activity after idle sends `active: true` at once.
- [x] 2.2 Consent notice on the dashboard, and "нет согласия" in report and AI views. Verify with tests.

## 3. Verification

- [x] 3.1 Run `npm run typecheck && npm test && npm run build` and `openspec validate fix-presence-and-consent --strict`.
- [ ] 3.2 On the test app, with two browser contexts for one user and a director watching:
  - closing one tab keeps the user online;
  - 5 idle minutes turn them offline;
  - a click turns them online.
