/** Deal notes end to end through the Express app and the real migrations (PGlite). */
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let anna: TestUser, alex: TestUser;
let dealId: string;

const as = (who: TestUser) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`),
  post: (path: string, body: object) => request(app).post(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body),
  patch: (path: string, body: object) => request(app).patch(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body)
});

const NOTES = "**Условия:** отсрочка 14 дней\n\n- [x] договор подписан\n- [ ] предоплата 30%";

beforeAll(async () => {
  harness = await startDbHarness();
  app = (await import("../app")).app;
  anna = await harness.user("anna", "EMPLOYEE", "Sales", { consent: true });
  alex = await harness.user("alex", "EMPLOYEE", "Sales", { consent: true });
  const funnel = (await harness.query<{ id: string }>("INSERT INTO deal_funnels (company_id, name) VALUES ($1, 'Основная') RETURNING id", [harness.company])).rows[0]!.id;
  await harness.query("INSERT INTO deal_stages (company_id, funnel_id, name, color, sort_order, outcome) VALUES ($1, $2, 'Квалификация', '#2563EB', 10, 'OPEN')", [harness.company, funnel]);
  const client = (await harness.query<{ id: string }>(
    "INSERT INTO clients (company_id, department_id, owner_id, name) VALUES ($1, $2, $3, 'ФОП Кіріченко') RETURNING id", [harness.company, anna.departmentId, anna.id])).rows[0]!.id;
  const created = await as(anna).post("/deals", { clientId: client, funnelId: funnel, title: "Оптовая партия", notes: NOTES });
  expect(created.status).toBe(201);
  dealId = created.body.data.id;
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("deal notes", () => {
  it("stores notes on create and returns them", async () => {
    const deal = await as(anna).get(`/deals/${dealId}`);
    expect(deal.body.data.notes).toBe(NOTES);
  });

  it("updates notes and audits the field name only", async () => {
    const ticked = NOTES.replace("- [ ] предоплата", "- [x] предоплата");
    const updated = await as(anna).patch(`/deals/${dealId}`, { notes: ticked });
    expect(updated.status).toBe(200);
    expect(updated.body.data.notes).toBe(ticked);
    const events = await harness.query<{ metadata: Record<string, unknown> }>("SELECT metadata FROM audit_logs WHERE action = 'DEAL_UPDATED' AND entity_id = $1", [dealId]);
    expect(events.rows.at(-1)!.metadata).toEqual({ fields: ["notes"] });
    expect(JSON.stringify(events.rows)).not.toContain("предоплата");
  });

  it("clears notes with an empty value", async () => {
    expect((await as(anna).patch(`/deals/${dealId}`, { notes: "" })).body.data.notes).toBeNull();
  });

  it("answers 404 to a colleague outside the deal's scope and changes nothing", async () => {
    expect((await as(alex).get(`/deals/${dealId}`)).status).toBe(404);
    expect((await as(alex).patch(`/deals/${dealId}`, { notes: "чужие заметки" })).status).toBe(404);
    const stored = await harness.query<{ notes: string | null }>("SELECT notes FROM deals WHERE id = $1", [dealId]);
    expect(stored.rows[0]!.notes).toBeNull();
  });

  it("rejects notes over 10 000 characters", async () => {
    expect((await as(anna).patch(`/deals/${dealId}`, { notes: "а".repeat(10_001) })).status).toBe(400);
  });
});
