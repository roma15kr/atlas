/** Correcting a deal after it was created: amount, probability, close date, title, stage, and who may reassign it. */
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let babenko: TestUser, trubylo: TestUser, head: TestUser;
let funnel: string, qualification: string, proposal: string, dealId: string;

const as = (who: TestUser) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`),
  post: (path: string, body: object) => request(app).post(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body),
  patch: (path: string, body: object) => request(app).patch(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body)
});
const stored = async () => (await harness.query<{ value: string; probability: number; title: string; owner_id: string; stage_id: string; expected_close_at: Date | null }>(
  "SELECT value, probability, title, owner_id, stage_id, expected_close_at FROM deals WHERE id = $1", [dealId])).rows[0]!;

beforeAll(async () => {
  harness = await startDbHarness();
  app = (await import("../app")).app;
  babenko = await harness.user("babenko", "EMPLOYEE", "Отдел продаж", { consent: true });
  trubylo = await harness.user("trubylo", "EMPLOYEE", "Отдел продаж", { consent: true });
  head = await harness.user("denysiuk", "MANAGER", "Отдел продаж", { consent: true });
  funnel = (await harness.query<{ id: string }>("INSERT INTO deal_funnels (company_id, name) VALUES ($1, 'Основная') RETURNING id", [harness.company])).rows[0]!.id;
  const stage = async (name: string, order: number) => (await harness.query<{ id: string }>(
    "INSERT INTO deal_stages (company_id, funnel_id, name, color, sort_order, outcome) VALUES ($1, $2, $3, '#2563EB', $4, 'OPEN') RETURNING id", [harness.company, funnel, name, order])).rows[0]!.id;
  qualification = await stage("Квалификация", 10);
  proposal = await stage("КП отправлено", 20);
  const client = (await harness.query<{ id: string }>(
    "INSERT INTO clients (company_id, department_id, owner_id, name) VALUES ($1, $2, $3, 'ТОВ Тепло') RETURNING id", [harness.company, babenko.departmentId, babenko.id])).rows[0]!.id;
  const created = await as(babenko).post("/deals", { clientId: client, funnelId: funnel, stageId: qualification, title: "Кабель для складу", value: 120000, probability: 30, expectedCloseAt: "2026-11-01T00:00:00.000Z" });
  expect(created.status).toBe(201);
  dealId = created.body.data.id;
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("editing a deal", () => {
  it("lets the owner correct amount, probability, close date, title and stage, audited by field name", async () => {
    const response = await as(babenko).patch(`/deals/${dealId}`, {
      value: 95000, probability: 60, expectedCloseAt: "2026-11-20T00:00:00.000Z", title: "Кабель для складу (2 етап)", stageId: proposal
    });
    expect(response.status).toBe(200);
    const deal = await stored();
    expect(Number(deal.value)).toBe(95000);
    expect(deal.probability).toBe(60);
    expect(deal.title).toBe("Кабель для складу (2 етап)");
    expect(deal.stage_id).toBe(proposal);
    expect(deal.expected_close_at?.toISOString()).toBe("2026-11-20T00:00:00.000Z");
    const audit = (await harness.query<{ metadata: { fields: string[] } }>(
      "SELECT metadata FROM audit_logs WHERE action = 'DEAL_UPDATED' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1", [dealId])).rows[0]!;
    expect(audit.metadata.fields).toEqual(expect.arrayContaining(["value", "probability", "expectedCloseAt", "title", "stageId"]));
    expect(JSON.stringify(audit.metadata)).not.toContain("95000");
  });

  it("answers 404 to a colleague and changes nothing", async () => {
    const before = await stored();
    expect((await as(trubylo).patch(`/deals/${dealId}`, { value: 1 })).status).toBe(404);
    expect(Number((await stored()).value)).toBe(Number(before.value));
  });

  it("doesn't let an employee hand the deal to someone else, but lets the head", async () => {
    // As for every record (identity-access «Owner assignment within scope»): an employee's owner is always themself.
    await as(babenko).patch(`/deals/${dealId}`, { ownerId: trubylo.id });
    expect((await stored()).owner_id).toBe(babenko.id);
    expect((await as(head).patch(`/deals/${dealId}`, { ownerId: trubylo.id })).status).toBe(200);
    expect((await stored()).owner_id).toBe(trubylo.id);
  });
});
