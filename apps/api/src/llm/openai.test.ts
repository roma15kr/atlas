import OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LlmError, llmConfigured, setLlmClient, structuredResponse } from "./openai";

const schema = z.object({ summary: z.string(), recommendations: z.array(z.string()) });
const call = () => structuredResponse({ model: "gpt-6-luna", schemaName: "work_analysis", schema, system: "rules", user: "{}" });
const fake = (parse: (body: never, options?: unknown) => Promise<unknown>) => { const spy = vi.fn(parse); setLlmClient({ responses: { parse: spy } }); return spy; };
const reason = async (promise: Promise<unknown>) => { try { await promise; return "resolved"; } catch (error) { return error instanceof LlmError ? error.reason : "other"; } };

afterEach(() => setLlmClient(null));

describe("structuredResponse", () => {
  it("returns the parsed output and sends model, instructions, input and a strict JSON schema", async () => {
    const spy = fake(async () => ({ output_parsed: { summary: "Итог", recommendations: ["Шаг"] }, output: [] }));
    expect(await call()).toEqual({ summary: "Итог", recommendations: ["Шаг"] });
    const [body, options] = spy.mock.calls[0]! as unknown as [Record<string, unknown> & { text: { format: { type: string; name: string; strict: boolean } } }, { timeout: number }];
    expect(body).toMatchObject({ model: "gpt-6-luna", instructions: "rules", input: "{}" });
    expect(body.text.format).toMatchObject({ type: "json_schema", name: "work_analysis", strict: true });
    expect(options.timeout).toBe(15_000);
  });

  it("reports a refusal", async () => {
    fake(async () => ({ output_parsed: null, output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] }));
    expect(await reason(call())).toBe("refused");
  });

  it("reports output that doesn't match the schema", async () => {
    fake(async () => ({ output_parsed: { summary: 5 }, output: [] }));
    expect(await reason(call())).toBe("unparsable");
    fake(async () => { throw new SyntaxError("Unexpected token"); });
    expect(await reason(call())).toBe("unparsable");
  });

  it("reports timeouts and API errors", async () => {
    fake(async () => { throw new OpenAI.APIConnectionTimeoutError({ message: "timed out" }); });
    expect(await reason(call())).toBe("timeout");
    fake(async () => { throw new OpenAI.APIError(500, undefined, "boom", new Headers()); });
    expect(await reason(call())).toBe("api_error");
  });

  it("is not configured without a key or a test client", async () => {
    expect(llmConfigured()).toBe(false);
    expect(await reason(call())).toBe("not_configured");
  });
});
