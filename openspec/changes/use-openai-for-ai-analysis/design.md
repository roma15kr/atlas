# Design

## Context

- `apps/api/src/ai.ts` `analyzeWork` builds `SystemMetrics` and a rule-based baseline. If `ANTHROPIC_API_KEY` is set, it calls the Anthropic Messages API with raw `fetch` and `ANTHROPIC_MODEL` (default `claude-sonnet-4-20250514`), parses JSON with `stripCodeFence`, and falls back to the rules on error or after 15 seconds.
- `routes/ai.ts` audits `AI_ANALYSIS_REQUESTED` with `{ mode, source }`.
- `components/AiAnalysisDialog.tsx` shows a "Claude" or "Правила" badge.
- `add-in-app-feedback` (proposed) also calls OpenAI `gpt-6-luna`. This change creates the shared client it will reuse, so it is applied first.

Access rules don't change: analysis of oneself, or of people the requester manages (`manageableUser`). Pipeline figures cover only funnels the requester may open. Presence is used only with monitoring consent.

No migrations. No new audit events; the `source` value in `AI_ANALYSIS_REQUESTED` becomes `AI` or `RULES`, and a `model` field is added.

## External services and environment variables

Recorded in `docs/external/README.md`:

| Variable | Change |
| --- | --- |
| `OPENAI_API_KEY` | New: server-side only, set in Coolify |
| `AI_ANALYSIS_MODEL` | New, default `gpt-6-luna` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Removed from `config.ts`, `.env.example` and the docs |

## Files

- `apps/api/src/llm/openai.ts`, new: `structuredResponse()`, a thin wrapper over the `openai` package's `responses.parse` with `zodTextFormat`. It handles timeouts, refusals and missing parsed output with a typed `LlmError`.
- `apps/api/src/ai.ts`:
  - replace the Anthropic `fetch` with `structuredResponse`;
  - add the per-mode instruction text and the ₴ formatting rule;
  - return `{ source: "AI", model }`;
  - remove `stripCodeFence`.
- `apps/api/src/config.ts`: add `OPENAI_API_KEY` and `AI_ANALYSIS_MODEL`, and remove `ANTHROPIC_*`. Keep the startup check that rejects demo seeding in production.
- `apps/api/src/routes/integrations.ts`: report `ai: { provider: "openai", model, enabled }`.
- `apps/api/package.json`: add `openai`.
- `apps/web/src/types.ts`: `AiAnalysis.source` becomes `'AI' | 'RULES'`, and `model?: string` is added.
- `apps/web/src/components/AiAnalysisDialog.tsx`: the badge reads "AI · gpt-6-luna" (info tone) or "Правила" (neutral). The fallback note becomes "Модель недоступна, использованы встроенные правила."
- `apps/web/src/data/demo.ts` and the demo branch of `analyze`: return `source: 'RULES'`.
- `.env.example`, `docs/external/README.md`, `docs/OPERATIONS.md`: the new variables.
- `openspec/specs`: `alerts-ai` deltas. "Work analysis" is replaced by "AI work analysis", because its Claude scenarios are retired; "Metadata-only AI input" is modified.

## Types and signatures

```ts
// apps/api/src/llm/openai.ts
export class LlmError extends Error { constructor(readonly reason: "not_configured" | "timeout" | "refused" | "unparsable" | "api_error", message?: string) }
export function llmConfigured(): boolean;
export function structuredResponse<T extends z.ZodTypeAny>(input: {
  model: string; schemaName: string; schema: T; system: string; user: string; timeoutMs?: number;
}): Promise<z.infer<T>>;

// apps/api/src/ai.ts
export type AiMode = "ADVICE" | "EVALUATION" | "FORECAST";
export const analysisSchema: z.ZodObject<{ summary: z.ZodString; recommendations: z.ZodArray<z.ZodString> }>;
export function analysisInstructions(mode: AiMode): string;
export function analyzeWork(auth: AuthContext, targetId: string, mode: AiMode, deps?: { llm?: typeof structuredResponse }): Promise<AiResult>;
type AiResult = { summary: string; recommendations: string[]; source: "AI" | "RULES"; model?: string; fallbackReason?: string; metrics: SystemMetrics };
```

## Call stack

1. `POST /ai/analyze` → `manageableUser` → `analyzeWork`.
2. `systemMetrics` (unchanged) → `ruleBased` baseline.
3. If `llmConfigured()`:
   - `structuredResponse({ model: AI_ANALYSIS_MODEL, schemaName: "work_analysis", schema: analysisSchema, system: BASE_RULES + analysisInstructions(mode), user: JSON.stringify({ mode, viewerRole, metrics, baseline }) })`;
   - on success, return `{ ...parsed, source: "AI", model }`.
4. On an `LlmError`, return the rules with `fallbackReason = reason`.
5. Write `AI_ANALYSIS_REQUESTED { mode, source, model }`, then respond.

## Test plan

**API unit (`ai.test.ts`, `llm/openai.test.ts`, OpenAI client stubbed):**
- `uses the model result and labels it AI with the model name`
- `falls back to rules when the key is missing, on timeout, on refusal and on unparsable output`
- `sends only mode, viewer role, metrics and baseline, never names or client data`
- `omits presence from the metrics and forbids mentioning it when consent is missing`
- `gives each mode its own instructions and the ₴ rule`

**API integration:** `audits AI_ANALYSIS_REQUESTED with source and model`.

**Web:** `shows the model badge for AI results and "Правила" for the fallback`.

**Live on the Coolify test app, with `OPENAI_API_KEY` set:** all three modes return distinct Russian results using "₴" and give no attendance without consent; the audit shows `source: AI`.

## Least confident decisions

1. **One small model for both features.** `gpt-6-luna` is cheap, about $0.00016 per analysis, but its reasoning on forecasts was shallow in the test. The per-mode instructions should help; if not, `AI_ANALYSIS_MODEL` switches models without code changes.
2. **Removing Claude entirely.** This removes the Anthropic integration rather than keeping both providers behind a switch. It means less code and one data processor; switching back later is a contained change.
3. **The `source` value.** It changes from `CLAUDE` to `AI` in API responses and the audit. Old audit rows keep `CLAUDE`, so a report on the success metric must count both.
