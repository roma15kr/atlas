# Design

## Context

- **Repository visibility.** The GitHub repository `roma15kr/atlas` is **public**: anything in an issue is world-readable.
- **AI integration today.**
  - `apps/api/src/ai.ts` calls Claude with raw `fetch` for the AI analysis screens. This change leaves it alone.
  - Translation and triage use **OpenAI `gpt-6-luna`**, chosen by the product owner on 2026-10-06 for cost: $0.10 in and $0.50 out per million tokens.
  - The API has no OpenAI SDK and no GitHub client.
  - `zod` is already an API dependency.
- **Logging.** `pino-http` logs requests but assigns no request id that the client can see. The web build has no version.
- **Uploads and storage.** `objectStorage` stores files (local volume or S3), and `routes/avatars.ts` `detectImageType` recognises PNG, JPEG and WebP by magic bytes.
- **Automation.** `automation/scheduler.ts` runs registered steps every 10 minutes under an advisory lock.
- **Web.** Every API call goes through `lib/api.ts` `apiRequest`. Pages render inside `AppShell`, whose top bar is on every signed-in screen.

## Access rules

| Action | DIRECTOR | MANAGER | EMPLOYEE |
| --- | --- | --- | --- |
| Send a report | yes | yes | yes |
| List and read own reports, own screenshot | yes | yes | yes |
| Read other people's reports, screenshots, logs | whole company | no (404) | no (404) |
| Dismiss or retry a report | yes | no (403) | no (403) |

The reporter's own read omits the log; they wrote it, and it isn't useful to them.

## Data: migration `013_feedback_reports.sql`

`feedback_reports`:
- **Identity and source:** `id`, `company_id`, `user_id`, `department_id`, `kind` (`PROBLEM|COMPLAINT|IDEA`), `message` (text of 10–5,000 characters), `page`, `app_version`, `user_agent`, `viewport`.
- **Attachments:** `diagnostics` (jsonb; the API caps it at 64 KB), and `screenshot_key` / `screenshot_mime` (nullable, with a check that both are set or neither is).
- **State:** `status` (`PENDING|PROCESSING|ISSUE_CREATED|FAILED|DISMISSED`), `attempts`, `next_attempt_at`, `last_error`.
- **Triage result:** `language`, `title_en`, `summary_en`, `translation_en`, `steps_en` (jsonb), `category` (`BUG|COMPLAINT|IDEA|QUESTION`), `severity` (`LOW|MEDIUM|HIGH|CRITICAL`), `area`.
- **Issue:** `issue_number`, `issue_url`, `triaged_at`, `created_at`, `updated_at`.
- **Indexes:** `(company_id, created_at DESC)`, `(user_id, created_at DESC)`, and a partial index on `(status, next_attempt_at)` where the status is `PENDING` or `FAILED`.
- **Single issue:** "no report produces two issues" is enforced by claiming a row with `UPDATE … SET status='PROCESSING' WHERE status IN (...) RETURNING`, and by never creating an issue for a row that already has `issue_number`.

New audit events: `FEEDBACK_SUBMITTED`, `FEEDBACK_ISSUE_CREATED`, `FEEDBACK_DISMISSED`, `FEEDBACK_RETRIED` and `FEEDBACK_VIEWED`.

## External services and environment variables

Recorded in `docs/external/README.md` (names only):

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Enables triage; set in Coolify |
| `FEEDBACK_MODEL` | Default `gpt-6-luna` |
| `GITHUB_TOKEN` | A fine-grained token limited to the one repository with Issues read/write and nothing else; set in Coolify |
| `GITHUB_REPOSITORY` | `owner/name`, for example `roma15kr/atlas` |
| `VITE_APP_VERSION` | Build argument for the web image: the git revision |
| `APP_VERSION` | Runtime environment variable for the API: the git revision |

## Files

**API (`apps/api/src`):**
- `routes/feedback.ts`: new. `POST /feedback` (multipart: `report` JSON plus an optional `screenshot`), `GET /feedback/mine`, `GET /feedback` (director), `GET /feedback/:id`, `GET /feedback/:id/screenshot`, `POST /feedback/:id/dismiss`, `POST /feedback/:id/retry`.
- `feedback/triage.ts`: new. The OpenAI call through the `openai` package's `responses.parse`, with `text.format = zodTextFormat(triageSchema, "feedback_triage")` (strict JSON schema), plus the personal-data scrub.
- `feedback/github.ts`: new. Issue creation through the GitHub REST API with `fetch`; labels are created on first use.
- `feedback/scrub.ts`: new. A regex pass that replaces email addresses, phone numbers and URLs with query strings.
- `automation/feedback.ts`: new. The step `processFeedback(now)`, registered after alerts.
- `app.ts`: `pino-http` `genReqId` uses an incoming `X-Request-Id` only if it is a UUID, otherwise `randomUUID()`, and sets the response header; mounts `feedbackRouter`.
- `config.ts`: adds `FEEDBACK_MODEL`, `GITHUB_TOKEN`, `GITHUB_REPOSITORY` and `APP_VERSION`.
- `middleware.ts`: `feedbackLimiter`, 10 per user per hour.
- `routes/integrations.ts`: reports `feedback: { openai, github }` as enabled or disabled.
- `package.json`: adds `openai`.

**Database:** `database/013_feedback_reports.sql`.

**Web (`apps/web/src`):**
- `lib/diagnostics.ts`: new. A ring buffer and `snapshot()`.
- `lib/screenshot.ts`: new. `captureScreen()`, using `modern-screenshot` `domToBlob` with a password-field filter, falling back to null.
- `lib/api.ts`: records each request (method, path without query, status, duration, `x-request-id`) into the diagnostics buffer.
- `components/FeedbackDialog.tsx`: new. The form, the screenshot preview and the log summary.
- `components/AppShell.tsx`: the top-bar button, and Ctrl+Shift+F.
- `pages/ChangePasswordPage.tsx`: the same button.
- `pages/FeedbackPage.tsx`: new. "Мои обращения" for everyone; for directors, also the inbox with filters, a detail dialog, dismiss and retry.
- `context/AppContext.tsx`: `submitFeedback`, with a demo branch that stores the report locally.
- `App.tsx` gets the route `/feedback`; `AppShell` gets the navigation entry "Обращения".
- `main.tsx`: installs the diagnostics hooks for errors, unhandled rejections, route changes and socket events.
- `vite.config.ts`: defines `__APP_VERSION__` from `VITE_APP_VERSION`.
- `package.json`: adds `modern-screenshot`.

**Infra:** `apps/web/Dockerfile` and `apps/api/Dockerfile` get the `APP_VERSION` build argument; `compose.yaml` passes `SOURCE_COMMIT` (set by Coolify) into both.

**Docs:**
- `docs/external/README.md`: the variables above.
- `docs/OPERATIONS.md`: how to create the GitHub token, and how to find a request id in the logs.
- `docs/ARCHITECTURE.md`: the code map entry.

## Types and signatures

```ts
// apps/web/src/lib/diagnostics.ts
type DiagnosticEvent =
  | { at: string; type: 'error'; message: string; source?: string }
  | { at: string; type: 'request'; method: string; path: string; status: number; ms: number; requestId?: string }
  | { at: string; type: 'route'; path: string }
  | { at: string; type: 'socket'; state: 'connect' | 'disconnect' | 'error' };
export function recordDiagnostic(event: DiagnosticEvent): void;
export function installDiagnostics(): () => void;
export function diagnosticsSnapshot(): { version: string; page: string; userAgent: string; viewport: string; language: string; timeZone: string; online: boolean; events: DiagnosticEvent[] };

// apps/web/src/lib/screenshot.ts
export function captureScreen(root?: HTMLElement): Promise<Blob | null>;

// apps/web/src/components/FeedbackDialog.tsx
export function FeedbackDialog(props: { screenshot: Blob | null; onClose: () => void }): JSX.Element;

// apps/api/src/feedback/triage.ts
export const triageSchema: z.ZodObject<{ language: 'uk'|'ru'|'en'|'other'; title; summary; translation; steps; category; severity; area }>;
export type Triage = z.infer<typeof triageSchema>;
export function triageReport(input: { kind: string; message: string; page: string; errors: string[] }): Promise<Triage>;

// apps/api/src/feedback/scrub.ts
export function scrubPersonalData(text: string): string;

// apps/api/src/feedback/github.ts
export function createIssue(input: { title: string; body: string; labels: string[] }): Promise<{ number: number; url: string }>;
export function feedbackIssueBody(report: FeedbackRow, triage: Triage): string;

// apps/api/src/automation/feedback.ts
export function processFeedback(now?: Date, deps?: { triage?: typeof triageReport; createIssue?: typeof createIssue }): Promise<{ processed: number; failed: number }>;
```

## Call stacks

**Submit**
1. `AppShell` button → `captureScreen()` runs before the dialog renders, so the dialog isn't in the picture.
2. `FeedbackDialog` → the user writes → `submitFeedback({ kind, message, includeScreenshot, includeLog })`.
3. A `FormData` is sent through `apiRequest('/feedback', POST)`.
4. `feedbackLimiter` → `routes/feedback.ts` validates with zod and checks the image with `detectImageType` → `objectStorage.put`.
5. `INSERT feedback_reports (status PENDING)` → `writeAudit FEEDBACK_SUBMITTED` → 201.
6. Then `setImmediate(() => processFeedback())`, so it doesn't wait for the 10-minute tick.

**Process (automation step, also after each submit)**
1. `processFeedback`: if OpenAI or GitHub isn't configured, return.
2. Claim up to 10 rows: `PENDING`, or `FAILED` with `attempts < 5` and `next_attempt_at <= now`, set to `PROCESSING`.
3. For each row:
   1. `triageReport`: `openai.responses.parse` with model `FEEDBACK_MODEL`, a system prompt with the anonymisation rules and the list of areas, and `text.format = zodTextFormat(triageSchema, "feedback_triage")`.
   2. `scrubPersonalData` on every English field.
   3. Build the body with `feedbackIssueBody`, then `createIssue`.
   4. `UPDATE status ISSUE_CREATED, issue_*` → `writeAutomationAudit FEEDBACK_ISSUE_CREATED`.
4. On an error: `attempts+1`, `next_attempt_at = now + 2^attempts minutes`, `status FAILED`, `last_error` (the message only).
5. A `refusal` content item in the response, or a missing `output_parsed`, is recorded as a failure with reason "refused" or "unparsable".

**Director review**
1. `FeedbackPage` → `GET /feedback` (list).
2. Opening a report → `GET /feedback/:id` (with `FEEDBACK_VIEWED`), then `<img>` loaded from `GET /feedback/:id/screenshot` through `api.download` as a Blob URL, because the token can't go on an `<img>`.
3. Dismiss → `POST /feedback/:id/dismiss`.
4. Retry → `POST /feedback/:id/retry` (resets the attempts).

## Test plan

**API integration (PGlite, `routes/feedback.integration.test.ts`):**
- `stores a report with screenshot and log and audits without text`
- `refuses a disguised screenshot and a log over 64 KB`
- `limits a user to 10 reports per hour`
- `lets the reporter list their own reports but not read a colleague's (404)`
- `lets a director read any report and its screenshot, and audits the view`
- `refuses dismiss and retry for managers and employees`

**API unit (`feedback/*.test.ts`):**
- `scrubPersonalData replaces emails, phones and query strings`
- `feedbackIssueBody contains no original text, reporter or log`
- `triageReport parses a structured response` (OpenAI client stubbed)
- `triageReport rejects a refusal`
- `triage prompt keeps placeholders and reports the source language` (prompt fixture)

**Automation (`automation/feedback.integration.test.ts`, fake triage and GitHub):**
- `creates exactly one issue per report even when two runs overlap`
- `waits while credentials are missing and processes afterwards`
- `retries with backoff and stops after 5 attempts`
- `skips dismissed reports`

**Platform:** `every response carries X-Request-Id and an incoming UUID is reused`.

**Web (Testing Library):**
- `opens the feedback dialog from the top bar with a preview captured before opening`
- `sends the screenshot and log by default and omits them when unticked`
- `validates a too-short description in Russian`
- `the diagnostic buffer records failed requests with their request id and never bodies or query strings`
- `password fields are blank in the capture filter`
- `"Мои обращения" shows status and issue number; directors also see the inbox`

**Live on the Coolify test app:**
- send a Ukrainian report with a screenshot;
- see the issue in GitHub with labels and no personal data;
- see the status in Atlas.

## Least confident decisions

1. **Automatic publishing to a public repository.** Every non-dismissed report becomes a public issue within minutes. That includes complaints, which may be about colleagues. Anonymisation lowers the risk but can't guarantee it. The alternatives are:
   - issues only after a director approves;
   - complaints held for approval while bugs and ideas go out automatically, which I'd recommend if automatic is too risky;
   - making the repository private.
2. **New libraries.**
   - `modern-screenshot` in the web app captures the page by redrawing the DOM, with no permission prompt. It can miss some cross-origin images and canvas content.
   - The alternative is the browser's screen-capture API. That needs no library, but asks the user's permission every time and opens a picker, so it isn't automatic.
   - The `openai` package in the API gives the `responses.parse` and `zodTextFormat` helpers for strict structured output and typed errors.
3. **Model quality.** `gpt-6-luna` was chosen for cost: about $0.0002 per report, so 50 reports a month cost under one cent. A live test on 2026-10-06 used a Ukrainian complaint containing two names, a company, a phone number, an email and an amount:
   - **Good:** no personal value leaked; the category, severity and area were right; the steps to reproduce were useful.
   - **Weak:** it reported the language as "English" and paraphrased the text instead of keeping `[person]`/`[client]` placeholders.

   The prompt therefore asks for the ISO 639-1 code of the *original* text (`uk`, `ru`, `en` or `other`, as an enum) and a faithful translation that keeps a placeholder wherever a value was removed. A fixture test covers both. If leaks appear in practice, `FEEDBACK_MODEL` can switch to a stronger model without code changes.
6. **A second AI provider.** Atlas will use Claude for the AI analysis screens and OpenAI for feedback triage. That means two keys and two data processors to mention in the privacy notice.
4. **Who sees reports.** Directors only. Heads are excluded because complaints may concern them, but that means heads can't follow their own team's bug reports.
5. **Log content.** Paths keep record ids, for example `/api/v1/clients/<uuid>`. That is useful for reproducing, but the ids aren't fully anonymous; they stay inside Atlas and are never sent to GitHub.
7. **Signed-in only.** Problems on the sign-in screen can't be reported.
