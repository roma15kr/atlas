/** Sub-departments end to end: a head covers their sub-departments, nobody else gains anything. */
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let salesHead: TestUser, diyHead: TestUser, promoter: TestUser, opsHead: TestUser, seller: TestUser;
let diyClient: string, salesClient: string;

const as = (who: TestUser) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`),
  post: (path: string, body: object) => request(app).post(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body),
  patch: (path: string, body: object) => request(app).patch(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body)
});
const client = async (owner: TestUser, name: string) => (await harness.query<{ id: string }>(
  "INSERT INTO clients (company_id, department_id, owner_id, name) VALUES ($1, $2, $3, $4) RETURNING id",
  [harness.company, owner.departmentId, owner.id, name])).rows[0]!.id;

beforeAll(async () => {
  harness = await startDbHarness();
  app = (await import("../app")).app;
  salesHead = await harness.user("denysiuk", "MANAGER", "Отдел продаж", { consent: true });
  seller = await harness.user("tymoshenko", "EMPLOYEE", "Отдел продаж", { consent: true });
  diyHead = await harness.user("semenets", "MANAGER", "Отдел DIY", { consent: true });
  promoter = await harness.user("boldyriev", "EMPLOYEE", "Отдел DIY", { consent: true });
  opsHead = await harness.user("kosian", "MANAGER", "Склад", { consent: true });
  await harness.query("UPDATE departments SET parent_id = $1 WHERE id = $2", [salesHead.departmentId, diyHead.departmentId]);
  diyClient = await client(promoter, "Епіцентр Житомир");
  salesClient = await client(seller, "ФОП Кіріченко");
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("sub-departments", () => {
  it("lets the parent head open a sub-department client, and not the other way round", async () => {
    expect((await as(salesHead).get(`/clients/${diyClient}`)).status).toBe(200);
    expect((await as(salesHead).get(`/clients/${salesClient}`)).status).toBe(200);
    expect((await as(diyHead).get(`/clients/${diyClient}`)).status).toBe(200);
    expect((await as(diyHead).get(`/clients/${salesClient}`)).status).toBe(404);
    const listed = (await as(salesHead).get("/clients?limit=100")).body.data.map((row: { id: string }) => row.id);
    expect(listed).toEqual(expect.arrayContaining([diyClient, salesClient]));
  });

  it("covers deals, tasks on the sub-department's board and Telegram chats", async () => {
    const funnel = (await harness.query<{ id: string }>("INSERT INTO deal_funnels (company_id, name) VALUES ($1, 'Основная') RETURNING id", [harness.company])).rows[0]!.id;
    await harness.query("INSERT INTO deal_stages (company_id, funnel_id, name, color, sort_order, outcome) VALUES ($1, $2, 'Квалификация', '#2563EB', 10, 'OPEN')", [harness.company, funnel]);
    const diyDeal = (await as(promoter).post("/deals", { clientId: diyClient, funnelId: funnel, title: "Стенд в Епіцентрі" })).body.data.id;
    const salesDeal = (await as(seller).post("/deals", { clientId: salesClient, funnelId: funnel, title: "Оптова партія" })).body.data.id;
    expect((await as(salesHead).get(`/deals/${diyDeal}`)).status).toBe(200);
    expect((await as(diyHead).get(`/deals/${salesDeal}`)).status).toBe(404);

    const diyBoard = (await harness.query<{ id: string }>("SELECT id FROM task_boards WHERE department_id = $1", [diyHead.departmentId])).rows[0]!.id;
    const task = await as(promoter).post("/tasks", { boardId: diyBoard, title: "Викладка товару" });
    expect(task.status).toBe(201);
    expect((await as(salesHead).get(`/tasks/${task.body.data.id}`)).status).toBe(200);
    expect((await as(opsHead).get(`/tasks/${task.body.data.id}`)).status).toBe(404);

    const contact = (await harness.query<{ id: string }>(
      "INSERT INTO telegram_contacts (company_id, telegram_user_id, first_name, responsible_id) VALUES ($1, 5001, 'Покупець', $2) RETURNING id",
      [harness.company, promoter.id])).rows[0]!.id;
    expect((await as(salesHead).get(`/telegram/contacts/${contact}`)).status).toBe(200);
    expect((await as(opsHead).get(`/telegram/contacts/${contact}`)).status).toBe(404);
  });

  it("lets the parent head assign sub-department owners, not the other way round", async () => {
    const assigned = await as(salesHead).post("/clients", { name: "Новий дилер", ownerId: promoter.id });
    expect(assigned.status).toBe(201);
    const stored = await harness.query<{ department_id: string }>("SELECT department_id FROM clients WHERE id = $1", [assigned.body.data.id]);
    expect(stored.rows[0]!.department_id).toBe(diyHead.departmentId);
    const refused = await as(diyHead).post("/clients", { name: "Чужий дилер", ownerId: seller.id });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("INVALID_OWNER");
  });

  it("lets the parent head manage the sub-department's head, but not his role", async () => {
    const reset = await as(salesHead).post(`/team/${diyHead.id}/reset-password`, { password: "Temp-Password-2026!" });
    expect(reset.status).toBe(200);
    const audited = await harness.query("SELECT 1 FROM audit_logs WHERE action = 'PASSWORD_RESET' AND entity_id = $1 AND actor_id = $2", [diyHead.id, salesHead.id]);
    expect(audited.rows).toHaveLength(1);
    expect((await as(salesHead).patch(`/team/${diyHead.id}`, { jobTitle: "керівник DIY" })).status).toBe(200);
    const promoted = await as(salesHead).patch(`/team/${diyHead.id}`, { role: "DIRECTOR" });
    expect(promoted.status).toBe(403);
    expect(promoted.body.error.code).toBe("ROLE_CHANGE_FORBIDDEN");
    const kpi = await as(salesHead).post("/kpis", { userId: diyHead.id, name: "Продажі DIY", target: 100, unit: "%" });
    expect(kpi.status).toBe(201);
    await harness.query("UPDATE users SET must_change_password = false WHERE id = $1", [diyHead.id]);
    expect((await as(diyHead).patch(`/team/${salesHead.id}`, { jobTitle: "x" })).status).toBe(404);
    expect((await as(opsHead).post(`/team/${diyHead.id}/reset-password`, { password: "Temp-Password-2026!" })).status).toBe(404);
  });

  it("changes nothing for a head without sub-departments or for employees", async () => {
    expect((await as(opsHead).get(`/clients/${diyClient}`)).status).toBe(404);
    expect((await as(opsHead).get(`/clients/${salesClient}`)).status).toBe(404);
    expect((await as(seller).get(`/clients/${diyClient}`)).status).toBe(404);
  });

  it("keeps departments one level deep, even when written directly", async () => {
    await expect(harness.query("UPDATE departments SET parent_id = $1 WHERE id = $2", [opsHead.departmentId, salesHead.departmentId]))
      .rejects.toThrow(/cannot be nested/);
    await expect(harness.query("UPDATE departments SET parent_id = $1 WHERE id = $2", [diyHead.departmentId, opsHead.departmentId]))
      .rejects.toThrow(/one level only/);
  });
});
