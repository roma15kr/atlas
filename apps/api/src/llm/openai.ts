import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { config } from "../config";

export type LlmFailure = "not_configured" | "timeout" | "refused" | "unparsable" | "api_error";

export class LlmError extends Error {
  constructor(readonly reason: LlmFailure, message?: string) {
    super(message ?? reason);
  }
}

/** The subset of the OpenAI client this module uses; tests swap in a fake. */
export interface ResponsesClient {
  responses: { parse: (body: never, options?: { timeout?: number; maxRetries?: number }) => Promise<unknown> };
}

let clientOverride: ResponsesClient | null = null;
let defaultClient: ResponsesClient | null = null;

/** Tests replace the client; `null` restores the real one. */
export function setLlmClient(client: ResponsesClient | null): void {
  clientOverride = client;
}

export function llmConfigured(): boolean {
  return Boolean(clientOverride || config.OPENAI_API_KEY);
}

function client(): ResponsesClient {
  if (clientOverride) return clientOverride;
  if (!config.OPENAI_API_KEY) throw new LlmError("not_configured");
  defaultClient ??= new OpenAI({ apiKey: config.OPENAI_API_KEY }) as unknown as ResponsesClient;
  return defaultClient;
}

interface ParsedResponse {
  output_parsed?: unknown;
  output?: Array<{ type: string; content?: Array<{ type: string; refusal?: string }> }>;
}

/**
 * One structured call: the model must answer with JSON matching `schema` (strict JSON schema).
 * Timeouts, refusals, unparsable output and API errors become an `LlmError` with a reason.
 */
export async function structuredResponse<T extends z.ZodTypeAny>(input: {
  model: string; schemaName: string; schema: T; system: string; user: string; timeoutMs?: number;
}): Promise<z.infer<T>> {
  const api = client();
  let response: ParsedResponse;
  try {
    response = await api.responses.parse({
      model: input.model,
      instructions: input.system,
      input: input.user,
      text: { format: zodTextFormat(input.schema, input.schemaName) }
    } as never, { timeout: input.timeoutMs ?? 15_000, maxRetries: 1 }) as ParsedResponse;
  } catch (error) {
    if (error instanceof LlmError) throw error;
    if (error instanceof OpenAI.APIConnectionTimeoutError) throw new LlmError("timeout");
    if (error instanceof OpenAI.APIError) throw new LlmError("api_error", `OpenAI returned ${error.status ?? "an error"}`);
    // The SDK's parse step throws on content that doesn't match the schema.
    throw new LlmError("unparsable", error instanceof Error ? error.message : undefined);
  }
  const refusal = response.output?.flatMap((item) => item.content ?? []).find((part) => part.type === "refusal");
  if (refusal) throw new LlmError("refused", refusal.refusal);
  const parsed = input.schema.safeParse(response.output_parsed);
  if (!parsed.success) throw new LlmError("unparsable");
  return parsed.data;
}
