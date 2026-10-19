# Tasks

## 1. Attachments

- [x] 1.1 Add the migration, upload endpoint (types, size, audit) and download endpoint (conversation access, headers). Verify integration cases: a member uploads an .xlsx and downloads it byte-identical; a non-member and another company get 404; an .exe renamed .pdf gets 400; an oversize file gets 413. Commit.
- [x] 1.2 Link `attachmentIds` when posting (file-only messages allowed, max 10, own unlinked uploads only), return `attachments` with messages, show «📎» in notification previews, erase files with the message, and clean up stale uploads. Verify cases: a message with two files lists them; someone else's upload id gets 400; deleting removes rows and objects; a stale upload is cleaned. Commit.
- [ ] 1.3 Add the composer paper clip, drop and paste, upload progress with «×», and attachment cards with download (the demo mirrors it). Verify `Chat.test.tsx` cases: attach and send an Excel file, see its card, download it; a file-only message; an unsupported file shows a Russian message. Commit.

## 2. Integration checks

- [ ] 2.1 Run `make check` and `npm run build`; verify both pass.
- [ ] 2.2 Run `npx openspec validate add-chat-attachments --strict`; verify it passes.

## Workflow follow-up

- PR into `dev`, check on atlas-dev with a real .xlsx, `dev` → `main`, live check with Харруд, archive.
