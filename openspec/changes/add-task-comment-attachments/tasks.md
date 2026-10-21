# Tasks

## 1. Task comment attachments

- [x] 1.1 Move the attachment checks to a shared module, add migration `025`, the upload and download endpoints, `attachmentIds` on comments, file-only comments, the «📎» notification preview, file removal with the task, and the shared cleanup step. Verify integration cases: an assignee uploads an .xlsx, posts it, and a board member downloads it byte-identical; an outside-department assignee of that task downloads it; someone who can't see the task gets 404; another user's upload id gets 400; deleting the task removes rows and objects; a stale upload is cleaned. Commit.
- [ ] 1.2 Extract `AttachmentPicker` and `AttachmentList` from chat, and use them in `TaskComments` (the demo mirrors it). Verify: the chat attachment tests still pass, and in `TaskBoards.test.tsx` an employee attaches a file to a comment, sends it without text, and downloads it. Commit.

## 2. Integration checks

- [ ] 2.1 Run `make check` and `npm run build`; verify both pass.
- [ ] 2.2 Run `npx openspec validate add-task-comment-attachments --strict`; verify it passes.

## Workflow follow-up

- PR into `dev`, check on atlas-dev, `dev` → `main`, live check, archive.
