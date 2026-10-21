# Proposal

## Why

**Problem.** Chat messages can carry files now, but task comments still can't. The files a task is about (an invoice, a price list, a signed act) end up in chat or Telegram, away from the task, and the next person who opens the task doesn't find them.

**Evidence.** The director, 2026-10-21, on a task in «Задачи отдела»: «Add the possibility to add files to task's comment also», right after chat attachments shipped.

**Success metric.** An assignee attaches an Excel file to a comment on a task, and a colleague who opens the task downloads it from the comment.

## What Changes

- **Attaching:** the task comment box gets the same paper clip and drag-and-drop as chat, up to 10 files per comment.
- **Same rules as chat:**
  - PDF, Word, Excel, CSV, PowerPoint, text, ZIP and images;
  - up to 20 MB each;
  - checked by content.
- **A comment can be only files.**
- **In the comment:** files show as the same cards as in chat; a click downloads the original.
- **Who can download:** anyone who can see the task, including a colleague from another department assigned to that one task. Anyone else gets 404.
- **Deleting a task** deletes its comments' files too. Uploads that were never posted are cleaned up after a day, as in chat.
- **Audit:** uploads are audited without file names.

## Announcement

Task comments can now carry files: press the paper clip under «Написать комментарий…» or drag files in. Everyone who sees the task downloads them with one click.

## Non-goals

- Files on the task itself outside comments (the description keeps pasted images only).
- Attachments in client comments or Telegram.
- Previews inside Atlas.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tasks`: task comments can carry file attachments.

## Impact

- **Data:** migration `025_task_comment_attachments.sql` adds a table like `chat_attachments`, keyed to the task and the comment.
- **API:**
  - `POST /tasks/:id/attachments` uploads a file;
  - posting a comment accepts `attachmentIds`;
  - `GET /tasks/attachments/:id` downloads one;
  - comments carry `attachments`.
  - The type checks and the cleanup job are shared with chat.
- **Web:**
  - the file picker and cards from chat become shared components;
  - `TaskComments` uses them;
  - the demo mirrors it.
