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
  get: (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`)
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
