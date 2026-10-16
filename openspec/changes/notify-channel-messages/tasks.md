# Tasks

## 1. Notify group and channel messages

- [ ] 1.1 Extend `notifyChat` with `CHAT_MESSAGE` for groups, channel top-level messages and thread participants, collapsed per conversation, skipping muted members, the author and the people mentioned. Verify integration cases: a channel member gets one collapsed notification for two messages; a muted member and a non-member get none; a reply notifies only the root author and earlier repliers; a mentioned member gets only the mention. Commit.
- [ ] 1.2 Add the push tag per conversation and the web icon/label for `CHAT_MESSAGE`. Verify a push payload test and a bell test; commit.

## 2. Integration checks

- [ ] 2.1 Run `make check` and `npm run build`; verify both pass.
- [ ] 2.2 Run `npx openspec validate notify-channel-messages --strict`; verify it passes.

## Workflow follow-up

- Archive `add-notifications` first. Then PR into `dev`, check, `dev` → `main`, and a live check with Atlas closed on Android and iPhone; archive.
