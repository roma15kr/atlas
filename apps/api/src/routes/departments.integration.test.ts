/** Department structure: a director nests one level; heads see their own part; every change is audited. */
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let boss: TestUser, salesHead: TestUser, diyHead: TestUser, promoter: TestUser, opsHead: TestUser;

const as = (who: TestUser) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`),
  patch: (path: string, body: object) => request(app).patch(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body)
});
const audit = async (action: string) => (await harness.query<{ metadata: Record<string, unknown> }>("SELECT metadata FROM audit_logs WHERE action = $1 ORDER BY id", [action])).rows;

beforeAll(async () => {
  harness = await startDbHarness();
  app = (await import("../app")).app;
  boss = await harness.user("nikonov", "DIRECTOR", "Руководство", { consent: true });
  salesHead = await harness.user("denysiuk", "MANAGER", "Отдел продаж", { consent: true });
  diyHead = await harness.user("semenets", "MANAGER", "Отдел DIY", { consent: true });
  promoter = await harness.user("boldyriev", "EMPLOYEE", "Отдел DIY", { consent: true });
  opsHead = await harness.user("kosian", "MANAGER", "Склад", { consent: true });
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("department structure", () => {
  it("lets a director place DIY under sales, audited, and the head of sales covers DIY right away", async () => {
    const client = (await harness.query<{ id: string }>(
      "INSERT INTO clients (company_id, department_id, owner_id, name) VALUES ($1, $2, $3, 'Епіцентр') RETURNING id",
      [harness.company, promoter.departmentId, promoter.id])).rows[0]!.id;
    expect((await as(salesHead).get(`/clients/${client}`)).status).toBe(404);
    const nested = await as(boss).patch(`/departments/${diyHead.departmentId}`, { parentId: salesHead.departmentId });
    expect(nested.status).toBe(200);
    expect(nested.body.data).toMatchObject({ name: "Отдел DIY", parentId: salesHead.departmentId, head: { id: diyHead.id }, memberCount: 2 });
    expect((await audit("DEPARTMENT_UPDATED")).at(-1)!.metadata).toEqual({ departmentId: diyHead.departmentId, parentId: salesHead.departmentId, previousParentId: null });
    expect((await as(salesHead).get(`/clients/${client}`)).status).toBe(200);
  });

  it("lists every department for a director and a head's own part for a head", async () => {
    const all = (await as(boss).get("/departments")).body.data.map((row: { name: string }) => row.name);
    expect(all).toEqual(expect.arrayContaining(["Руководство", "Отдел продаж", "Отдел DIY", "Склад"]));
    const sales = (await as(salesHead).get("/departments")).body.data.map((row: { name: string }) => row.name).sort();
    expect(sales).toEqual(["Отдел DIY", "Отдел продаж"]);
    expect((await as(promoter).get("/departments")).status).toBe(403);
  });

  it("refuses a second level and nesting into itself", async () => {
    const deeper = await as(boss).patch(`/departments/${opsHead.departmentId}`, { parentId: diyHead.departmentId });
    expect(deeper.status).toBe(400);
    expect(deeper.body.error.code).toBe("DEPARTMENT_NESTING");
    expect((await as(boss).patch(`/departments/${salesHead.departmentId}`, { parentId: opsHead.departmentId })).body.error.code).toBe("DEPARTMENT_NESTING");
    expect((await as(boss).patch(`/departments/${opsHead.departmentId}`, { parentId: opsHead.departmentId })).body.error.code).toBe("DEPARTMENT_NESTING");
  });

  it("lets only a director change the structure, auditing a refusal", async () => {
    const refused = await as(salesHead).patch(`/departments/${opsHead.departmentId}`, { parentId: salesHead.departmentId });
    expect(refused.status).toBe(403);
    expect(await audit("DEPARTMENT_UPDATE_DENIED")).toHaveLength(1);
    const parent = await harness.query<{ parent_id: string | null }>("SELECT parent_id FROM departments WHERE id = $1", [opsHead.departmentId]);
    expect(parent.rows[0]!.parent_id).toBeNull();
  });

  it("detaches a sub-department again", async () => {
    const detached = await as(boss).patch(`/departments/${diyHead.departmentId}`, { parentId: null });
    expect(detached.body.data.parentId).toBeNull();
    expect((await audit("DEPARTMENT_UPDATED")).at(-1)!.metadata).toMatchObject({ parentId: null, previousParentId: salesHead.departmentId });
  });
});
