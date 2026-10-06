/** AI analysis through the shared OpenAI client (faked), with the rule fallback. */
import type { Express } from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startDbHarness, type TestUser } from "./test/dbHarness";
import { setLlmClient } from "./llm/openai";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let head: TestUser, anna: TestUser, boris: TestUser;
const analyze = (who: TestUser, targetUserId: string, mode = "ADVICE") =>
  request(app).post("/api/v1/ai/analyze").set("Authorization", `Bearer ${who.token}`).send({ mode, targetUserId });
const fakeModel = (reply: () => Promise<unknown>) => {
  const spy = vi.fn(reply);
  setLlmClient({ responses: { parse: spy as never } });
  return spy;
};
const sentPayload = (spy: ReturnType<typeof vi.fn>) => JSON.parse((spy.mock.calls.at(-1)![0] as { input: string }).input);

beforeAll(async () => {
  harness = await startDbHarness();
  app = (await import("./app")).app;
  head = await harness.user("head", "MANAGER", "Sales");
  anna = await harness.user("anna", "EMPLOYEE", "Sales", { consent: true });
  boris = await harness.user("boris", "EMPLOYEE", "Sales");
  await harness.query("UPDATE users SET full_name = 'Анна Коваль' WHERE id = $1", [anna.id]);
}, 60_000);

afterEach(() => setLlmClient(null));
afterAll(async () => harness?.stop());

describe("AI analysis", () => {
  it("returns the model's result labelled AI with the model name and audits both", async () => {
    fakeModel(async () => ({ output_parsed: { summary: "Сводка модели", recommendations: ["Шаг 1"] }, output: [] }));
    const response = await analyze(head, anna.id);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ summary: "Сводка модели", recommendations: ["Шаг 1"], source: "AI", model: "gpt-6-luna" });
    const audit = await harness.query<{ metadata: Record<string, unknown> }>("SELECT metadata FROM audit_logs WHERE action = 'AI_ANALYSIS_REQUESTED' ORDER BY created_at DESC LIMIT 1");
    expect(audit.rows[0]?.metadata).toMatchObject({ mode: "ADVICE", source: "AI", model: "gpt-6-luna" });
  });

  it("sends only mode, viewer role, metrics and baseline, never names", async () => {
    const spy = fakeModel(async () => ({ output_parsed: { summary: "ok", recommendations: [] }, output: [] }));
    await analyze(head, anna.id, "FORECAST");
    const payload = sentPayload(spy);
    expect(Object.keys(payload).sort()).toEqual(["baseline", "metrics", "mode", "viewerRole"]);
    expect(JSON.stringify(payload)).not.toContain("Анна");
    expect(JSON.stringify(payload)).not.toContain("anna");
  });

  it("withholds presence figures for someone without monitoring consent", async () => {
    const spy = fakeModel(async () => ({ output_parsed: { summary: "ok", recommendations: [] }, output: [] }));
    await analyze(head, boris.id);
    expect(sentPayload(spy).metrics.presence).toEqual({ consent: false });
    await analyze(head, anna.id);
    expect(sentPayload(spy).metrics.presence.consent).toBe(true);
  });

  it("falls back to the rules with a reason when the model refuses or returns nonsense", async () => {
    fakeModel(async () => ({ output_parsed: null, output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] }));
    const refused = await analyze(head, anna.id);
    expect(refused.body.data).toMatchObject({ source: "RULES", fallbackReason: "refused" });
    expect(refused.body.data.summary).toMatch(/Приоритеты/);
    fakeModel(async () => ({ output_parsed: { summary: 1 }, output: [] }));
    expect((await analyze(head, anna.id)).body.data).toMatchObject({ source: "RULES", fallbackReason: "unparsable" });
  });

  it("uses the rules without a reason when no key is configured", async () => {
    const response = await analyze(head, anna.id);
    expect(response.body.data.source).toBe("RULES");
    expect(response.body.data.fallbackReason).toBeUndefined();
  });
});
