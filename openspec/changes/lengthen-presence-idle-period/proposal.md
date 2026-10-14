# Proposal

## Why

**Problem.** Atlas marks a person «не в сети» after only 5 minutes without keyboard or mouse activity. People reading a document, on a phone call or talking to a colleague drop offline all day, so «Команда» shows 3 of 36 online while most of the office is working.

**Evidence.** The director asked for it on 2026-10-14: «I need to prolong online status for x minutes … automatically by the system like in the ClickUp standard period».

**Research.**
- **ClickUp** has no documented idle period. Its green dot goes out soon after the tab closes or the laptop sleeps, and it does not show people offline for short pauses.
- **Comparable tools** wait longer than Atlas:
  - Slack marks people away after about 10 to 30 minutes idle;
  - RingCentral after 15 minutes;
  - Atlas after 5.

**Success metric.** During working hours, the share of active staff shown online in «Команда» matches who is actually at work. Checked by the director comparing the dot with reality on two working days after the release.

## What Changes

- A person stays «в сети» for **15 minutes** without activity, instead of 5, before becoming «не в сети».
- The period is a server setting, `PRESENCE_IDLE_MINUTES` (5 to 120, default 15), changed in Coolify without a release. The browser takes it from the server when it connects.
- Unchanged:
  - closing the last Atlas tab still makes the person offline at once, as in ClickUp;
  - losing the connection (sleep, network) still does so after 5 minutes without heartbeats.
- The onboarding deck's «Через 5 минут без активности…» becomes «Через 15 минут…».

## Announcement

Atlas no longer shows you «не в сети» after 5 minutes away from the mouse. You now stay online for 15 minutes without activity, so reading, calls and short conversations don't make you disappear. Closing Atlas still makes you offline right away.

## Non-goals

- Manual statuses («На встрече», «Обед», out of office) with a duration, ClickUp's «Set status». Not needed now.
- An «Away» state between online and offline.
- A per-company setting in the UI (no company settings store exists yet).
- A delay after closing the last tab.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `presence`: the idle period becomes configurable, 15 minutes by default, and is sent to the browser.

## Impact

- **Attendance:** presence history and attendance reports count up to 15 idle minutes as online instead of up to 5. The history still records exactly what colleagues saw.
- **Config:** one optional server variable. No migration.
- **Docs:** onboarding slide 12 (HTML; the PDF is regenerated) and `docs/ARCHITECTURE.md`.
