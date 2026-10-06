import { z } from "zod";
import { config } from "../config";
import { structuredResponse } from "../llm/openai";
import { scrubPersonalData } from "./scrub";

export const FEEDBACK_AREAS = [
  "crm-clients", "sales-pipeline", "tasks", "documents", "team-chat", "email-client", "telegram-inbox", "team-management",
  "presence", "performance-rating", "reports", "alerts-ai", "identity-access", "platform-operations", "web-workspace"
] as const;

export const triageSchema = z.object({
  language: z.enum(["uk", "ru", "en", "other"]),
  title: z.string(),
  summary: z.string(),
  translation: z.string(),
  steps: z.array(z.string()),
  category: z.enum(["BUG", "COMPLAINT", "IDEA", "QUESTION"]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  area: z.enum(FEEDBACK_AREAS)
});

export type Triage = z.infer<typeof triageSchema>;

/** Tested live on gpt-6-luna on 2026-10-06 (openspec/changes/add-in-app-feedback/triage-prompt.md). */
export const TRIAGE_SYSTEM_PROMPT = `You triage user feedback for Atlas, a CRM and virtual office used by a Ukrainian team. Your output becomes a PUBLIC GitHub issue.

Rules:
- "language": the ISO 639-1 code of the ORIGINAL report text (uk for Ukrainian, ru for Russian, en for English, other otherwise). It is not the language of your output.
- "translation": a faithful, complete English translation of the original text, sentence by sentence. Do not shorten, soften or paraphrase.
- Anonymise everywhere: replace each personal name with [person], each company or client name with [client], phone numbers with [phone], emails with [email], money amounts with [amount], and record contents with [record]. Keep the placeholder exactly where the value was, so the sentence still makes sense. Never copy those values.
- "title": at most 80 characters, in English, no personal data.
- "summary": 2-4 English sentences for a developer.
- "steps": steps to reproduce only if the text gives them; otherwise an empty list.
- "area": one of ${FEEDBACK_AREAS.join(", ")}.`;

export interface TriageInput {
  kind: string;
  message: string;
  page: string;
  /** Error lines from the diagnostic log, for example "PATCH /api/v1/deals/... 500". */
  errors: string[];
}

export function triageUserMessage(input: TriageInput): string {
  return `Kind: ${input.kind}\nPage: ${input.page}\nErrors: ${input.errors.length ? input.errors.join("; ") : "none"}\n\nReport text:\n${input.message}`;
}

/** Translates, summarises, classifies and anonymises one report; the English fields are scrubbed once more. */
export async function triageReport(input: TriageInput): Promise<Triage> {
  const result = await structuredResponse({
    model: config.FEEDBACK_MODEL,
    schemaName: "feedback_triage",
    schema: triageSchema,
    system: TRIAGE_SYSTEM_PROMPT,
    user: triageUserMessage(input),
    timeoutMs: 30_000
  });
  return {
    ...result,
    title: scrubPersonalData(result.title).slice(0, 80),
    summary: scrubPersonalData(result.summary),
    translation: scrubPersonalData(result.translation),
    steps: result.steps.map(scrubPersonalData)
  };
}
