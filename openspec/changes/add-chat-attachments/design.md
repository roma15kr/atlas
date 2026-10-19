# Design

## Decisions

1. **Two-step upload.**
   - The composer uploads each file as soon as it is chosen (`POST /chat/conversations/:id/attachments`, multipart `file`), showing progress and «×» to drop it.
   - Sending the message passes `attachmentIds`. The server links only uploads by the same user in the same conversation that are still unlinked.
   - An unsent upload older than 24 hours is deleted by the existing automation timer.
2. **Types.**
   - An allowlist by extension and declared type: pdf, docx, doc, xlsx, xls, csv, pptx, txt, zip, png, jpg, jpeg, gif and webp.
   - Office/ZIP files are checked by their magic bytes (PDF `%PDF`, OOXML/ZIP `PK`, legacy Office `D0CF11E0`), images by `detectRichImageType`, and text and CSV must be valid UTF-8.
   - Anything else gets 400 `UNSUPPORTED_FILE_TYPE`.
   - Size: `MAX_UPLOAD_MB` (20 MB by default) gives 413 `FILE_TOO_LARGE`. More than 10 per message gives 400 `CHAT_TOO_MANY_ATTACHMENTS`.
3. **Download.**
   - `GET /chat/attachments/:id` checks `chatAccessSql` for the attachment's conversation; anyone else gets 404.
   - It streams with `Content-Disposition: attachment; filename*=UTF-8''…`, `X-Content-Type-Options: nosniff` and `Cache-Control: private`.
   - Each download is not audited (it's ordinary reading); uploads are audited as `CHAT_ATTACHMENT_UPLOADED` with id, type and size, never the file name.
4. **Messages.**
   - The body becomes optional when `attachmentIds` is non-empty (0–4000 characters).
   - `messageColumns` adds `attachments: [{ id, fileName, mimeType, size }]`.
   - Notification previews show «📎 <file name>» when there's no text.
5. **Deletion.** Deleting a message deletes its attachment rows and objects, in the same erase path as pasted images. An anchor kept for replies has no attachments.
6. **Web.**
   - The composer has a paper-clip `IconButton` («Прикрепить файл») and accepts dropped or pasted files. Pasted images still go inline as today.
   - A message shows `AttachmentCard`s: type icon, name, «1,2 МБ». A click downloads through `lib/api.ts` with the session token.

## Risks / Trade-offs

- **Storage growth:** about 20 people and 20 MB per file is modest on the existing volume, and the same backups cover it.
- **Malware in Office files:** files are only stored and downloaded, never opened by Atlas. The type check rejects executables, and desktop antivirus still applies.
