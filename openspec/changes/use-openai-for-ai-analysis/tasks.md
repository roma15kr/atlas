# Tasks

Each slice ends with `make check && npm run build` passing, and a commit. A test must fail without the change it tests.

## 1. Tracer bullet: analysis through OpenAI

- [ ] 1.1 Add `openai` and `llm/openai.ts` `structuredResponse`, with `LlmError` for timeouts, refusals and unparsable output. Unit tests with a stubbed client.
- [ ] 1.2 `analyzeWork` uses it with `AI_ANALYSIS_MODEL`, returns `source: AI` and `model`, and falls back to the rules. Tests for each fallback reason, and for the payload holding metrics only.
- [ ] 1.3 The audit includes the model. Integration test.

## 2. Distinct modes

- [ ] 2.1 `analysisInstructions(mode)` and the ₴ rule. Tests for each mode's instructions, and that presence is forbidden without consent.

## 3. Web

- [ ] 3.1 The `AiAnalysis` type, the badge "AI · <model>" or "Правила", the fallback note, and the demo branch. Testing Library test.

## 4. Remove Claude and release

- [ ] 4.1 Remove `ANTHROPIC_*` from `config.ts` and `.env.example`, and update `docs/external/README.md` and `docs/OPERATIONS.md`.
- [ ] 4.2 Set `OPENAI_API_KEY` in Coolify, deploy, and check all three modes live, in Russian with "₴", with no attendance without consent, and `source: AI` in the audit.
- [ ] 4.3 Update `STATUS.md`.
