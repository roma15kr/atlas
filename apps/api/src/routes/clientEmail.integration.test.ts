/** A client's email is optional: created without one, or cleared later. */
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let manager: TestUser;
const post = (body: object) => request(app).post("/api/v1/clients").set("Authorization", `Bearer ${manager.token}`).send(body);
const base = { name: "Олег Коваль", companyName: "ТОВ Сумиенергосервіс", phone: "+380 67 123 45 67", source: "Звонок" };

beforeAll(async () => {
  harness = await startDbHarness();
  app = (await import("../app")).app;
  manager = await harness.user("denysiuk", "MANAGER", "Отдел продаж", { consent: true });
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("client email", () => {
  it("creates a client without an email, or with none", async () => {
    const without = await post(base);
    expect(without.status).toBe(201);
    expect(without.body.data.email).toBeNull();
    const none = await post({ ...base, email: null });
    expect(none.status).toBe(201);
    expect(none.body.data.email).toBeNull();
  });

  it("rejects an empty address, so the web sends none instead", async () => {
    expect((await post({ ...base, email: "" })).status).toBe(400);
  });

  it("clears an email on edit", async () => {
    const created = (await post({ ...base, email: "oleg@sumy.ua" })).body.data.id as string;
    const cleared = await request(app).patch(`/api/v1/clients/${created}`).set("Authorization", `Bearer ${manager.token}`).send({ email: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.email).toBeNull();
  });
});
