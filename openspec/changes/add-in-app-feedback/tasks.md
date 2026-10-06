# Tasks

Each slice ends with `make check && npm run build` passing, and a commit. A test must fail without the change it tests.

## 1. Tracer bullet: text report end to end

- [x] 1.1 Migration `014_feedback_reports.sql`, with only the columns needed to submit and list.
- [x] 1.2 `POST /feedback` (text and page only), `GET /feedback/mine`, and `FEEDBACK_SUBMITTED` audit. Tests: stores, validates, audits without the text.
- [x] 1.3 The top-bar button opens `FeedbackDialog` (kind and description), and `submitFeedback` (with demo branch) shows a confirmation. Tests: opens from any page, short-description error.
- [x] 1.4 The "Мои обращения" page lists the user's reports with the status "Ожидает обработки". Test.

## 2. Screenshot

- [x] 2.1 Add `modern-screenshot`; `captureScreen()` runs before the dialog opens, blanks password fields, and falls back to null. Tests for the filter and the fallback message.
- [x] 2.2 Multipart upload with `detectImageType` and a 3 MB limit, plus `GET /feedback/:id/screenshot` for the reporter. Tests: disguised file and size refused.
- [x] 2.3 A preview in the dialog with "Не прикладывать снимок". Test.

## 3. Diagnostic log and request ids

- [x] 3.1 API: `X-Request-Id` on every response, the same id in the pino log, and an incoming UUID is reused. Test.
- [x] 3.2 Build version: `APP_VERSION` and `VITE_APP_VERSION` from Coolify's `SOURCE_COMMIT`, passed through Compose and the Dockerfiles.
- [x] 3.3 `lib/diagnostics.ts` buffer, fed by `apiRequest`, errors, routes and the socket; the snapshot goes with the report (64 KB cap). Tests: a failed request is logged with its id; no bodies, query strings or typed text.
- [x] 3.4 The log summary in the dialog with "Приложить технический журнал". Test.

## 4. Director inbox and rate limit

- [x] 4.1 `GET /feedback`, `GET /feedback/:id` (with `FEEDBACK_VIEWED`), the director screenshot read and retry; 404 or 403 for other roles. Tests for each role.
- [x] 4.2 `feedbackLimiter`, 10 per hour per user. Test.
- [x] 4.3 The director view on `FeedbackPage`: filters, a detail dialog with the original, the screenshot, the log and the translation, plus retry. Tests.

## 5. Translation and summary

- [x] 5.1 Requires `use-openai-for-ai-analysis` slice 1, which provides `llm/openai.ts`. `triageReport` uses `structuredResponse` with `FEEDBACK_MODEL` (default `gpt-6-luna`), handles refusals and unparsable output, and runs `scrubPersonalData`. Unit tests with a stubbed client, plus a fixture for the source-language code and the placeholders.
- [x] 5.2 The `processFeedback` automation step (claim, triage, store), without GitHub yet; it runs after submit and every 10 minutes. Tests: waits without credentials, backoff, the attempt limit.

## 6. GitHub issues

- [ ] 6.1 `createIssue` and `feedbackIssueBody` (labels created on first use), plus the scrub again before sending. Tests: no original text, reporter or log in the body.
- [ ] 6.2 The step creates exactly one issue per report, stores the number and link, and audits `FEEDBACK_ISSUE_CREATED`. Tests include overlapping runs.
- [ ] 6.3 Integration status in `/integrations` and in the director inbox, showing what's missing.

## 7. Release

- [ ] 7.1 Documentation:
  - `docs/external/README.md`: the variable names;
  - `docs/OPERATIONS.md`: creating the GitHub token, and finding a request id in the logs;
  - `docs/ARCHITECTURE.md`: the code map entry.
- [ ] 7.2 Take screenshots of the dialog and the inbox at desktop and 400px widths, against `ui-design-system`.
- [ ] 7.3 On the Coolify test app, after `GITHUB_TOKEN` and `OPENAI_API_KEY` are set: a Ukrainian report with a screenshot becomes an English GitHub issue with labels and no personal data, and the status shows in Atlas.
- [ ] 7.4 Update `STATUS.md`.
