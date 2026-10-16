# Tasks

## 1. Erase on delete

- [x] 1.1 Delete the row of a message without replies (or keep a contentless anchor with replies, removing reactions), recompute `last_message_at`, emit `chat:message-removed`, and remove the anchor once its last reply is gone. Verify `chat` integration cases: no row left, reactions gone, replies kept under an anchor, anchor removed after the last reply, moderation still audited with ids. Commit.
- [x] 1.2 Store the message id on chat notifications and delete them with the message; delete images only this message used. Verify cases: the recipient's mention notification and the collapsed DM notification disappear; an image used only here is gone (`/images/:id` 404) while one also used in a task description stays. Commit.
- [x] 1.3 Add `database/022_erase_deleted_messages.sql` for earlier deletions, and remove the message from the web view on `chat:message-removed` (demo mirrors it). Verify a migration test and a `Chat.test.tsx` case; commit.

## 2. Integration checks

- [x] 2.1 Run `make check` and `npm run build`; verify both pass.
- [x] 2.2 Run `npx openspec validate erase-deleted-messages --strict`; verify it passes.

## Workflow follow-up

- PR into `dev`, check on atlas-dev, `dev` → `main`, live check, archive.
