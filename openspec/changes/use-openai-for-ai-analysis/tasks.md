# Tasks

Each slice ends with `make check && npm run build` passing, and a commit. A test must fail without the change it tests.

## 1. Tracer bullet: analysis through OpenAI

- [x] 1.1 Add `openai` and `llm/openai.ts` `structuredResponse`, with `LlmError` for timeouts, refusals and unparsable output. Unit tests with a stubbed client.
- [x] 1.2 `analyzeWork` uses it with `AI_ANALYSIS_MODEL`, returns `source: AI` and `model`, and falls back to the rules. Tests for each fallback reason, and for the payload holding metrics only.
- [x] 1.3 The audit includes the model. Integration test.

## 2. Distinct modes

- [x] 2.1 `analysisInstructions(mode)` and the ₴ rule. Tests for each mode's instructions, and that presence is forbidden without consent.

## 3. Stored analyses and history

- [x] 3.1 Migration `013_ai_analyses.sql`; store every result; `GET /ai/analyses` and `GET /ai/analyses/:id` through `manageableUser`; `analysisId` in the audit. Integration tests for each role, 404 out of scope, and that rule fallbacks are stored.
- [x] 3.2 Web: the `AiAnalysis` type, the badge "AI · <model>" or "Правила", the fallback note, the "Новый анализ"/"История" views, and demo branches. Testing Library tests.
- [ ] 3.3 Take screenshots of the dialog and the history at desktop and 400px widths, against `ui-design-system`.

## 4. Remove Claude and release

- [x] 4.1 Remove `ANTHROPIC_*` from `config.ts` and `.env.example`, and update `docs/external/README.md` and `docs/OPERATIONS.md`.
- [ ] 4.2 Set `OPENAI_API_KEY` in Coolify, deploy, and check all three modes live, in Russian with "₴", with no attendance without consent, and `source: AI` in the audit.
- [ ] 4.3 Update `STATUS.md`.
