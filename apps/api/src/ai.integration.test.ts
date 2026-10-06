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

describe("analysis modes", () => {
  const instructionsFor = async (mode: string) => {
    const spy = fakeModel(async () => ({ output_parsed: { summary: "ok", recommendations: [] }, output: [] }));
    await analyze(head, anna.id, mode);
    return (spy.mock.calls.at(-1)![0] as { instructions: string }).instructions;
  };

  it("gives each mode its own purpose with the shared rules", async () => {
    const [advice, evaluation, forecast] = [await instructionsFor("ADVICE"), await instructionsFor("EVALUATION"), await instructionsFor("FORECAST")];
    expect(advice).toContain("Mode ADVICE");
    expect(evaluation).toContain("Mode EVALUATION");
    expect(forecast).toContain("Mode FORECAST");
    expect(forecast).toContain("weighted pipeline");
    for (const text of [advice, evaluation, forecast]) {
      expect(text).toContain("Answer in Russian");
      expect(text).toContain("₴");
      expect(text).toContain("presence.consent is false");
    }
    expect(new Set([advice, evaluation, forecast]).size).toBe(3);
  });
});

describe("stored analyses", () => {
  let boss: TestUser, opsHead: TestUser, olga: TestUser;
  const history = (who: TestUser, targetUserId?: string) =>
    request(app).get(`/api/v1/ai/analyses${targetUserId ? `?targetUserId=${targetUserId}` : ""}`).set("Authorization", `Bearer ${who.token}`);
  const byId = (who: TestUser, id: string) => request(app).get(`/api/v1/ai/analyses/${id}`).set("Authorization", `Bearer ${who.token}`);

  beforeAll(async () => {
    boss = await harness.user("boss", "DIRECTOR", null);
    opsHead = await harness.user("opshead", "MANAGER", "Ops");
    olga = await harness.user("olga", "EMPLOYEE", "Ops");
    await harness.query("DELETE FROM ai_analyses");
  });

  it("stores every analysis, from the model or the rules, with requester, subject and figures", async () => {
    fakeModel(async () => ({ output_parsed: { summary: "Прогноз модели", recommendations: ["Шаг"] }, output: [] }));
    const fromModel = await analyze(head, anna.id, "FORECAST");
    setLlmClient(null);
    const fromRules = await analyze(anna, anna.id, "ADVICE");
    expect(fromModel.body.data).toMatchObject({ id: expect.any(String), mode: "FORECAST", source: "AI" });
    const rows = await harness.query<{ requested_by: string; subject_id: string; source: string; model: string | null; metrics: { kpiProgress: number } }>(
      "SELECT requested_by, subject_id, source, model, metrics FROM ai_analyses ORDER BY created_at");
    expect(rows.rows).toEqual([
      expect.objectContaining({ requested_by: head.id, subject_id: anna.id, source: "AI", model: "gpt-6-luna" }),
      expect.objectContaining({ requested_by: anna.id, subject_id: anna.id, source: "RULES", model: null })
    ]);
    expect(typeof rows.rows[0]!.metrics.kpiProgress).toBe("number");
    const audit = await harness.query<{ metadata: { analysisId: string } }>("SELECT metadata FROM audit_logs WHERE action = 'AI_ANALYSIS_REQUESTED' ORDER BY created_at DESC LIMIT 1");
    expect(audit.rows[0]?.metadata.analysisId).toBe(fromRules.body.data.id);
  });

  it("shows an employee only the analyses they ran themselves", async () => {
    const own = await history(anna);
    expect(own.status).toBe(200);
    expect(own.body.data.map((row: { mode: string }) => row.mode)).toEqual(["ADVICE"]);
    const managers = (await harness.query<{ id: string }>("SELECT id FROM ai_analyses WHERE requested_by = $1", [head.id])).rows[0]!.id;
    expect((await byId(anna, managers)).status).toBe(404);
  });

  it("shows the department head and the director everything about the employee, newest first", async () => {
    for (const viewer of [head, boss]) {
      const list = await history(viewer, anna.id);
      expect(list.body.data.map((row: { mode: string }) => row.mode)).toEqual(["ADVICE", "FORECAST"]);
      expect(list.body.data[1]).toMatchObject({ requestedByName: expect.any(String), source: "AI", recommendations: ["Шаг"] });
    }
  });

  it("answers 404 to a colleague and to the head of another department", async () => {
    expect((await history(boris, anna.id)).status).toBe(404);
    expect((await history(olga, anna.id)).status).toBe(404);
    expect((await history(opsHead, anna.id)).status).toBe(404);
    const any = (await harness.query<{ id: string }>("SELECT id FROM ai_analyses LIMIT 1")).rows[0]!.id;
    expect((await byId(opsHead, any)).status).toBe(404);
    expect((await byId(boss, any)).status).toBe(200);
  });
});
