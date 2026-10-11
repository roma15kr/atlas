# Design

## Context

See proposal.md (Why) and the specs for the requirements. Current state, from the code:

- **Plain text everywhere.** All the text fields are plain `text` columns validated by zod:
  - `chat_messages.body`, 1–4000 characters, rendered by `MessageText` (`components/chat/ChatParts.tsx`), which splits out `@username` mentions;
  - `tasks.description`, up to 10,000 (`routes/tasks.ts`, `components/TaskDialog.tsx`);
  - `clients.notes`, up to 10,000, and `client_comments.body`, 1–5000 (`routes/clients.ts`, `pages/ClientPage.tsx`);
  - `users.job_description`, up to 20,000 (`routes/team.ts`, `routes/teamAdmin.ts`, `components/team/JobDescriptionDialog.tsx`).
- **What doesn't exist yet.** Tasks have no comments. Deals have no notes column (`database/001_schema.sql`, `routes/deals.ts`, deal form in `pages/SalesPage.tsx`).
- **Images.** Avatars are the precedent: multer memory upload, `detectImageType`, `objectStorage.put`, and `GET /api/v1/avatars/:id`, served publicly by an unguessable id.
- **Auth for images.** The access token lives only in memory (AGENTS.md), so a plain `<img src>` cannot authenticate.
- **Security policy.** The CSP in `apps/web/nginx.conf` allows `img-src 'self' data: blob: https:` and `script-src 'self'`.
- **Mentions** are parsed on the server from the message body (`routes/chat.ts`, the "Usernames mentioned as `@username`" helper).
- **Dependencies.** The web app has 7 runtime dependencies and no Markdown or editor library.

## Goals / Non-Goals

**Goals:**
- One editor component and one display component, used by every formatted field.
- Markdown stays the only stored format, so the API, AI analysis and export see plain readable text.
- No `dangerouslySetInnerHTML` without sanitizing first.

**Non-Goals:**
- Server-side rendering of Markdown.
- Images in email or Telegram.
- Collaborative editing.

## Decisions

1. **Libraries.**
   - **Display:** `marked` (GFM) and `dompurify`, both approved.
   - **Editor (needs approval):** TipTap 3 (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-table`, `@tiptap/extension-list`, `@tiptap/extension-image`, `@tiptap/extension-mention`, `@tiptap/extensions`, `@tiptap/markdown`), all MIT, built on ProseMirror. `@tiptap/markdown` parses and serializes Markdown, so the editor round-trips the stored text.
   - *Alternatives:*
     - Lexical: Markdown support is weaker for tables and task lists.
     - Milkdown: Markdown-native but a smaller ecosystem.
     - A textarea with preview: rejected by the user, who chose WYSIWYG.
2. **Lazy editor.** `RichTextEditor` is loaded with `React.lazy`, so the TipTap chunk downloads only when an editor first opens. Read-only views use only `marked` and `dompurify`.
3. **One display pipeline** (`lib/markdown.ts`):
   - `marked` runs with GFM on, and its `html` renderer escapes raw HTML, so it shows as text.
   - DOMPurify allows only the tags the supported formatting produces.
   - A hook keeps links only for `http:`, `https:` and `mailto:`, and adds `target="_blank" rel="noopener noreferrer"`.
   - A hook keeps an `<img>` only when its `src` matches `/api/v1/images/<uuid>`; otherwise it becomes its alt text.
   - Task-list checkboxes get `data-task-index`.
   - *Alternative:* render on the server and store HTML. Rejected: two formats to keep in sync, and AI would get HTML.
4. **Mentions.**
   - In the editor, the TipTap Mention extension, fed by the existing chat people list, serializes to `@username`.
   - In the display, a DOM walk wraps `@username` text nodes outside `code` and `pre` in the existing mention markup.
   - On the server, mention extraction first blanks out fenced code blocks and inline code spans, so code never notifies anyone.
5. **Interactive checklists.**
   - `RichTextView` takes an optional `onChange(markdown)`. Clicking a checkbox calls `toggleTask(markdown, index)`, which flips the Nth task marker outside code fences, and then saves through the field's existing update call (PATCH task, client, deal or member).
   - Without `onChange`, the checkboxes are disabled.
6. **Images.**
   - **Upload:** `POST /api/v1/images` (multer, 5 MB limit, PNG, JPEG, GIF or WebP by magic bytes) stores the file through `objectStorage.put` and inserts a row in `rich_text_images`. It returns `{ id, url: "/api/v1/images/<id>" }`.
   - **Read:** `GET /api/v1/images/:id` requires auth, answers 404 for another company, and sends `Cache-Control: private, max-age=31536000, immutable`.
   - **Display:** the web `AuthImage` component fetches the image through `lib/api.ts` with the bearer token and shows it via `URL.createObjectURL`, cached per id for the session.
   - **Rate limit:** an `express-rate-limit` limiter keyed by user id, 60 per hour.
   - *Alternative:* signed URLs. Rejected: they need key rotation and expiry handling for no gain at this scale.
7. **Task comments.**
   - New table `task_comments`, modelled on `client_comments`: `GET /api/v1/tasks/:id/comments` (oldest first) and `POST` with 1–5000 characters.
   - Access uses the existing `scopedTask` (board access), so a task the caller can't open answers 404 `TASK_NOT_FOUND`.
   - `ON DELETE CASCADE` on `task_id`. Each new comment is audited as `TASK_COMMENT_CREATED` with the task id only.
8. **Deal notes.**
   - New column `deals.notes text` (up to 10,000), in the create, update and select schemas.
   - Covered by the existing deal scope and funnel access. The existing `DEAL_UPDATED` audit already records changed field names.
9. **Plain-text previews.** `markdownToPlain(md)` (web) strips formatting marks, turns images into «[изображение]» and joins table cells with spaces. It is used by the conversation list, notifications and board cards.
10. **Length limits** apply to the Markdown, as today. The editor shows a counter near the limit and blocks saving above it.

**Access rules (DIRECTOR, MANAGER, EMPLOYEE).**
- **Task comments:** whoever can open the task's board, for every role; no role widens it.
- **Deal notes:** as the deal:
  - DIRECTOR: every deal in funnels they can access;
  - MANAGER: their department's deals;
  - EMPLOYEE: their own deals.
- **Images:**
  - upload: any ACTIVE user;
  - read: any signed-in user of the same company who has the id. The id appears only in texts that user can already see.

**Migrations:**
- `015_task_comments.sql`;
- `016_deal_notes.sql`;
- `017_rich_text_images.sql`.

**Audit events:** `TASK_COMMENT_CREATED` (new) and `RICH_TEXT_IMAGE_UPLOADED` (new; metadata: mime and size). `DEAL_UPDATED` gains the `notes` field name.

### Files

| File | Change |
|---|---|
| `apps/web/package.json` | add `marked`, `dompurify`, TipTap packages |
| `apps/web/src/lib/markdown.ts` | new: `renderMarkdown`, `markdownToPlain`, `toggleTask` |
| `apps/web/src/components/richtext/RichTextView.tsx` | new: sanitized display, mention chips, checkbox handling, `AuthImage` swap |
| `apps/web/src/components/richtext/RichTextEditor.tsx` | new, lazy: TipTap editor, toolbar, shortcuts, image paste/drop, mention suggestions, counter |
| `apps/web/src/components/richtext/AuthImage.tsx` | new: fetches `/api/v1/images/:id` with the token |
| `apps/web/src/lib/api.ts` | `uploadImage`, `fetchImageBlob` |
| `apps/web/src/components/chat/ChatParts.tsx` | `MessageText` and `Composer` use the view and editor |
| `apps/web/src/components/chat/ChatDialogs.tsx` | edit-message dialog uses the editor |
| `apps/web/src/components/TaskDialog.tsx`, `TaskCard.tsx` | editor, view, comments panel, plain preview |
| `apps/web/src/pages/ClientPage.tsx` | notes and comments: editor and view |
| `apps/web/src/pages/SalesPage.tsx` | deal notes field and view |
| `apps/web/src/components/team/JobDescriptionDialog.tsx`, `pages/TeamPage.tsx`, `pages/ProfilePage.tsx` | editor and view |
| `apps/web/src/context/AppContext.tsx`, `data/demo.ts` | demo branches for task comments, deal notes, image upload (object URL) |
| `apps/web/src/styles.css` | `.rich-text` typography, tables, task lists, toolbar (ui-design-system tokens) |
| `database/015_task_comments.sql`, `016_deal_notes.sql`, `017_rich_text_images.sql` | new tables and column |
| `apps/api/src/routes/images.ts` | new upload and read routes |
| `apps/api/src/app.ts` | mount `/api/v1/images` after `authenticate` |
| `apps/api/src/routes/tasks.ts` | comments endpoints |
| `apps/api/src/routes/deals.ts` | `notes` in schemas and selects |
| `apps/api/src/routes/chat.ts` | mention extraction skips code |
| `apps/api/src/routes/avatars.ts` (`detectImageType`) | add GIF |

### Types and signatures

```ts
// web: lib/markdown.ts
export function renderMarkdown(markdown: string): string;          // sanitized HTML
export function markdownToPlain(markdown: string): string;
export function toggleTask(markdown: string, index: number): string;

// web: components/richtext
export function RichTextView(props: { markdown: string; people?: Map<string, ChatPerson>; myUsername?: string; onChange?: (markdown: string) => Promise<void> }): JSX.Element;
export const RichTextEditor: React.LazyExoticComponent<(props: { value: string; onChange: (markdown: string) => void; maxLength: number; label: string; placeholder?: string; people?: ChatPerson[]; onSubmit?: () => void; autoFocus?: boolean }) => JSX.Element>;
export function AuthImage(props: { src: string; alt: string }): JSX.Element;

// web: lib/api.ts
export function uploadImage(file: File): Promise<{ id: string; url: string }>;

// api
export interface TaskComment { id: string; body: string; createdAt: string; author: { id: string; fullName: string } }
export function mentionedUsernames(body: string): { usernames: string[]; channel: boolean }; // now ignores code
```

### Call stacks

- **Send a formatted chat message:**
  1. `Composer` → `RichTextEditor` (TipTap) → Markdown with `@username`.
  2. `backend.send` → `POST /chat/conversations/:id/messages` → `mentionedUsernames` (code skipped) → insert message and mentions → socket `chat:message`.
  3. On each client: `MessageText` → `RichTextView` → `renderMarkdown` → mention walk → DOM.
- **Tick a checklist item:** `RichTextView` click → `toggleTask(md, i)` → `onChange` → `PATCH /tasks/:id { description }` → `TASK_UPDATED` audit → refreshed view.
- **Paste an image:**
  1. Editor paste handler → `uploadImage` → `POST /api/v1/images` → `detectImageType` → `objectStorage.put` → insert `rich_text_images` → audit.
  2. The editor inserts `![](/api/v1/images/<id>)`.
  3. The view shows `AuthImage` → `GET /api/v1/images/:id` → blob URL.
- **Task comment:** `TaskDialog` comments panel → `POST /tasks/:id/comments` → `scopedTask` → insert → `TASK_COMMENT_CREATED` → list refresh.

### Test plan

- **`lib/markdown.test.ts`:**
  - `renders GFM tables, task lists and code` (HTML contains `<table>`, disabled checkboxes, `<pre><code>`);
  - `escapes raw HTML and drops javascript: links` (no `<img onerror>`, no `href="javascript:`);
  - `keeps only Atlas image URLs` (an external `src` becomes text);
  - `markdownToPlain strips marks and images` («Итог: КП», «[изображение]»);
  - `toggleTask flips only the Nth item outside code fences`.
- **`components/richtext/RichTextView.test.tsx`:**
  - `wraps mentions outside code only`;
  - `ticking a box calls onChange with the toggled markdown`;
  - `checkboxes are disabled without onChange`.
- **`components/richtext/RichTextEditor.test.tsx`** (jsdom; TipTap works with contenteditable):
  - `Ctrl+B makes the selection bold and emits **text**`;
  - `blocks saving above the limit and shows the overflow`;
  - `refuses a PDF drop with a message`.
- **`pages/Chat.test.tsx`:**
  - `sends a formatted message and shows it formatted, preview plain`;
  - `mention inside a list notifies, inside code does not` (demo backend).
- **`routes/chat.test.ts`:** `mentionedUsernames ignores fenced and inline code`.
- **`routes/tasks.test.ts` (dbHarness):**
  - `comments: board member reads and adds; outsider gets 404 TASK_NOT_FOUND; audit has no body`;
  - `deleting a task deletes its comments`.
- **`routes/deals.test.ts`:**
  - `notes are stored, returned and audited by field name`;
  - `out-of-scope deal notes update answers 404`.
- **`routes/images.integration.test.ts`:**
  - `uploads a PNG and serves it to the same company only`;
  - `rejects PDFs and files over 5 MB`;
  - `limits uploads to 60 per hour per user`.
- **Pages:**
  - `pages/ClientPage.test.tsx`, `components/TaskDialog.test.tsx`: `notes/description render formatted and checklist ticks save`;
  - `JobDescriptionDialog.test.tsx`: `template inserts headings and lists`.

## Risks / Trade-offs

- [Bundle size: TipTap is about 150–200 KB gzip] → lazy chunk; the read-only pipeline is about 30 KB gzip; check `npm run build` output in the last slice.
- [Markdown round-trip changes whitespace or list markers on first save] → accept normalisation; texts stay semantically equal; tested with representative samples.
- [Existing plain text that starts with `#`, `-` or `1.` now renders as headings or lists] → acceptable; the data is days old.
- [Pasted image ids could be shared outside their conversation within the company] → ids are unguessable and same-company only; this is noted as a least-confident decision.
- [Orphaned images when text is edited or deleted] → kept; a later cleanup job can delete images that no text references.
- [jsdom support for contenteditable is limited] → keep editor tests to commands and serialization; check visually in the live check.

## Migration Plan

1. Deploy migrations 015–017. They are additive; a rollback leaves unused tables and a column behind.
2. Run the live check with test content (a task, a deal, a client comment, a chat message with an image).
3. Delete that test content afterwards: the test task with its comments, the test deal, the test client comment, and the test chat message. Record the deleted ids in STATUS.md.

## Least confident decisions

1. Whether TipTap 3 is approved as the editor library; the whole editor slice depends on it.
2. Images readable by any same-company user who has the id, rather than checking access to the text that contains them.
3. Keeping the 4000-character limit for chat messages, which formatted tables may hit.
4. Task comments and client comments can't be edited or deleted after posting.
5. Normalising Markdown on first save, which could surprise someone comparing raw text.
