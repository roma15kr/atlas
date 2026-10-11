import { afterEach, describe, expect, it, vi } from "vitest";
import { LlmError, setLlmClient } from "../llm/openai";
import { scrubPersonalData } from "./scrub";
import { triageReport, triageUserMessage, TRIAGE_SYSTEM_PROMPT } from "./triage";

afterEach(() => setLlmClient(null));

describe("scrubPersonalData", () => {
  it("replaces emails, Ukrainian phone numbers and URL query strings", () => {
    expect(scrubPersonalData("Write to olena.petrenko@romashka.ua")).toBe("Write to [email]");
    for (const phone of ["067 123 45 67", "+380 67 123 45 67", "(067) 123-45-67", "+380671234567"]) {
      expect(scrubPersonalData(`call ${phone} now`)).toBe("call [phone] now");
    }
    expect(scrubPersonalData("see https://atlas.test/crm?q=Ромашка&token=abc")).toBe("see https://atlas.test/crm?[query]");
  });

  it("leaves dates, amounts, statuses and request ids alone", () => {
    const text = "On 2026-10-06 the PATCH returned 500 after 412 ms for 125 000 UAH, request 9c1e2f00-0000-4000-8000-000000000000";
    expect(scrubPersonalData(text)).toBe(text);
  });
});

describe("triageReport", () => {
  const reply = { language: "uk", title: "Changes vanish after saving for anna@example.com, and this title is far too long to fit into eighty characters", summary: "Call 067 123 45 67.", translation: "[person] cannot save.", steps: ["Open a deal", "Mail anna@example.com"], category: "BUG", severity: "HIGH", area: "sales-pipeline" };

  it("sends the tested instructions with the report and returns a cleaned result", async () => {
    const parse = vi.fn(async () => ({ output_parsed: reply, output: [] }));
    setLlmClient({ responses: { parse: parse as never } });
    const result = await triageReport({ kind: "PROBLEM", message: "Не зберігається", page: "/sales", errors: ["PATCH /api/v1/deals/1 500"] });
    const body = (parse.mock.calls[0] as unknown as [{ model: string; instructions: string; input: string }])[0];
    expect(body).toMatchObject({ model: "gpt-6-luna", instructions: TRIAGE_SYSTEM_PROMPT });
    expect(body.input).toBe(triageUserMessage({ kind: "PROBLEM", message: "Не зберігається", page: "/sales", errors: ["PATCH /api/v1/deals/1 500"] }));
    expect(body.input).toContain("Errors: PATCH /api/v1/deals/1 500");
    expect(result.title.length).toBeLessThanOrEqual(80);
    expect(JSON.stringify(result)).not.toMatch(/anna@example\.com|067 123 45 67/);
    expect(result.summary).toBe("Call [phone].");
  });

  it("passes a refusal on as an LlmError", async () => {
    setLlmClient({ responses: { parse: (async () => ({ output_parsed: null, output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] })) as never } });
    await expect(triageReport({ kind: "IDEA", message: "Темна тема", page: "/", errors: [] })).rejects.toBeInstanceOf(LlmError);
  });
});
