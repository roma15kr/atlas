# Tasks

## 1. The idle period comes from the server

- [x] 1.1 Add `PRESENCE_IDLE_MINUTES` (5–120, default 15) to `config.ts` with a config test, and emit `presence:config { idleMinutes }` on socket connect. Verify a socket test receives `{ idleMinutes: 15 }`; commit.
- [x] 1.2 Make `trackActivity` take an adjustable idle period (default 15 min), and apply `presence:config` in `AppContext`. Verify the `activity.test.ts` cases (still active at 14 minutes, idle at 15, follows a changed period) and `heartbeat.test.tsx` pass; commit.

## 2. Docs

- [x] 2.1 Update onboarding slide 12 (HTML), `docs/ARCHITECTURE.md` and `docs/external/README.md`. Verify `rg "[^1]5 минут без активности"` finds nothing; commit.
- [ ] 2.2 Regenerate `Atlas_Onboarding_Employees_RU.pdf` and `rendered/slide-12.png` from the HTML by printing it in Chrome. Blocked in this workspace: the headless Chromium lacks system libraries (`libnss3`) and there is no Docker. Do it on a machine with Chrome, or after the libraries are added to the workspace image.

## 3. Integration checks

- [x] 3.1 Run `make check` and `npm run build`; verify both pass.
- [x] 3.2 Run `npx openspec validate lengthen-presence-idle-period --strict`; verify it passes.

## Workflow follow-up

- PR into `dev`; on atlas-dev, check that a tab left alone for 10 minutes stays online. Then `dev` → `main`, live check, archive.
