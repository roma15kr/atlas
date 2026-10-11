# Tasks

## 1. Tracer bullet: formatted chat messages (display only)

- [x] 1.1 Add `marked` and `dompurify` to `apps/web`; create `lib/markdown.ts` (`renderMarkdown`, `markdownToPlain`, `toggleTask`) with `lib/markdown.test.ts` covering tables, task lists, code, escaped raw HTML, dropped `javascript:` links, external images and plain previews. Verify the tests pass.
- [x] 1.2 Create `components/richtext/RichTextView.tsx` (sanitized HTML, mention chips outside code, disabled checkboxes without `onChange`) and use it in chat `MessageText`; use `markdownToPlain` for conversation previews and notifications. Verify `RichTextView.test.tsx` and a new `Chat.test.tsx` case ("shows a formatted message, preview plain") pass in demo mode.
- [x] 1.3 Make the server's chat mention extraction skip inline code and code blocks. Verify the new `routes/chat.test.ts` case fails before and passes after; commit.

## 2. Formatting editor in chat

- [ ] 2.1 Get the user's approval for TipTap 3 (design decision 1), then add the TipTap packages and create the lazy `RichTextEditor`:
  - toolbar for basics, checklist and table;
  - Ctrl/⌘+B, I and K;
  - a counter that blocks saving over the limit;
  - Markdown in and out.

  Verify `RichTextEditor.test.tsx` (bold shortcut, limit) passes.
- [ ] 2.2 Use the editor in the chat composer, thread replies and the edit-message dialog, with @-suggestions from the chat people list serialized as `@username`. Verify the `Chat.test.tsx` case "sends a formatted message with a mention in a list" passes and the existing chat tests still pass; commit.

## 3. Task descriptions and checklists

- [ ] 3.1 Use the editor for descriptions in `TaskDialog`, the view on the task, and plain previews on `TaskCard`; ticking a checklist item saves through the existing task update. Verify the `TaskDialog.test.tsx` case "description renders formatted and a ticked item saves" passes in demo mode; commit.

## 4. Task comments

- [ ] 4.1 Add `database/015_task_comments.sql` and `GET`/`POST /api/v1/tasks/:id/comments` (board access via `scopedTask`, 1–5000 characters, `TASK_COMMENT_CREATED` audit without body, cascade on task delete). Verify the new `routes/tasks.test.ts` cases (reader and writer, outsider 404, cascade) pass.
- [ ] 4.2 Add the comments panel to `TaskDialog` with the editor and view, plus a demo-mode branch in `AppContext`. Verify the `TaskDialog.test.tsx` case "adds a formatted comment" passes; commit.

## 5. Client notes and comments

- [ ] 5.1 Use the editor and view for client notes (interactive checklist for editors) and the comment feed (read-only checklists) on `ClientPage`. Verify the `ClientPage.test.tsx` cases pass; commit.

## 6. Deal notes

- [ ] 6.1 Add `database/016_deal_notes.sql` and `notes` to the deal create, update and select schemas. Verify the `routes/deals.test.ts` cases (stored, returned, audited by field name, out-of-scope 404) pass.
- [ ] 6.2 Add the notes field and formatted view to the deal form and deal view in `SalesPage`, with a demo branch. Verify a `SalesPage` test "deal notes render formatted" passes; commit.

## 7. Job descriptions

- [ ] 7.1 Use the editor in `JobDescriptionDialog` (keeping counter and template, with the template turned into headings and lists) and the view in `TeamPage` and `ProfilePage`. Verify the updated `JobDescriptionDialog.test.tsx` passes; commit.

## 8. Pasted images

- [ ] 8.1 Add `database/017_rich_text_images.sql` and `routes/images.ts`:
  - `POST /api/v1/images`: PNG, JPEG, GIF or WebP, 5 MB, 60 per hour per user, `RICH_TEXT_IMAGE_UPLOADED` audit;
  - `GET /api/v1/images/:id`: authenticated, same company, otherwise 404;
  - GIF support in `detectImageType`.

  Verify `routes/images.integration.test.ts` passes.
- [ ] 8.2 Add `uploadImage` to `lib/api.ts`, plus `AuthImage` (blob URL) and paste/drop in the editor (placeholder while uploading, message for other files), with a demo branch using object URLs. Verify the `RichTextEditor.test.tsx` case "refuses a PDF drop" and a `RichTextView` case "shows Atlas images through AuthImage" pass; commit.

## 9. Integration checks

- [ ] 9.1 Run `make check` and `npm run build`; note the size of the main and editor chunks in STATUS.md, and verify the editor is a separate lazy chunk.
- [ ] 9.2 Run `npx openspec validate add-rich-text-editor --strict`; verify it passes.

## Workflow follow-up

- Live check after deploy: create a test task with comments, a test deal with notes, a client comment and a chat message with an image; confirm the formatting, checklists and images work. Then delete all of that test content and record the deleted ids in STATUS.md.
- Archive the change after review.
