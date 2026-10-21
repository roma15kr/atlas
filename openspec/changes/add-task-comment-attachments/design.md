# Design

## Decisions

1. **Own table, shared rules.**
   - `task_comment_attachments (id, company_id, task_id, comment_id NULL, uploaded_by, file_name, mime_type, size_bytes, storage_key, created_at)`.
   - `task_id` is `ON DELETE CASCADE`, and `comment_id` references `task_comments` with `ON DELETE CASCADE`.
   - Type and name checks reuse `attachmentType` and `uploadedFileName` from `chat/attachments.ts`, moved to a shared `attachments/` module.
   - The limits are the same: `MAX_UPLOAD_MB` and 10 per comment.
2. **Access.**
   - Upload, post and download use the task access check that comments already use, so a task outside the caller's view answers 404 `TASK_NOT_FOUND` / `ATTACHMENT_NOT_FOUND`.
   - This covers every role's scope, personal tasks and cross-department assignees, exactly as reading the task does.
   - An unposted upload is downloadable only by its uploader.
3. **Posting.**
   - The comment body becomes optional when `attachmentIds` is non-empty.
   - Linking accepts only the caller's own unposted uploads for the same task; otherwise 400 `TASK_INVALID_ATTACHMENT`.
   - Comments return `attachments: [{ id, fileName, mimeType, size }]`.
   - The `TASK_COMMENTED` notification preview shows «📎 <name>» for a file-only comment.
4. **Deletion.**
   - The task delete handler collects the storage keys of its attachments before deleting the task, then removes the objects after commit.
   - The `chat-uploads` cleanup step becomes `attachment-uploads` and also clears task uploads unposted for a day.
5. **Web.**
   - `AttachmentPicker` (paper clip, drop zone, per-file progress and «×») and `AttachmentList` (cards with download) move out of chat into `components/attachments/`.
   - Each takes `upload(file)` / `download(id)` functions, so chat and task comments share them.
   - Demo mode keeps files in memory, like the chat demo.

## Risks / Trade-offs

- **Shared components:** moving the chat composer's attachment parts touches chat; the existing chat attachment tests guard that.
