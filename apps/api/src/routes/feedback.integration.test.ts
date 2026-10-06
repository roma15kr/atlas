/** In-app problem reports: submitting, listing, screenshots and director access. */
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDbHarness, type TestUser } from "../test/dbHarness";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let anna: TestUser, boris: TestUser;

const report = (overrides: Record<string, unknown> = {}) => ({ kind: "PROBLEM", message: "Кнопка «Зберегти» нічого не робить", page: "/sales", appVersion: "abc1234", ...overrides });
const submit = (who: TestUser, body: Record<string, unknown> = report()) =>
  request(app).post("/api/v1/feedback").set("Authorization", `Bearer ${who.token}`).field("report", JSON.stringify(body));
const mine = (who: TestUser) => request(app).get("/api/v1/feedback/mine").set("Authorization", `Bearer ${who.token}`);

beforeAll(async () => {
  harness = await startDbHarness();
  app = (await import("../app")).app;
  anna = await harness.user("anna", "EMPLOYEE", "Sales");
  boris = await harness.user("boris", "EMPLOYEE", "Sales");
}, 60_000);

afterAll(async () => harness?.stop());

describe("submitting a report", () => {
  it("stores it as pending with the page and version, and audits without the text", async () => {
    const response = await submit(anna);
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ id: expect.any(String), status: "PENDING" });
    const row = (await harness.query<{ kind: string; page: string; app_version: string; status: string; user_id: string }>(
      "SELECT kind, page, app_version, status, user_id FROM feedback_reports WHERE id = $1", [response.body.data.id])).rows[0];
    expect(row).toEqual({ kind: "PROBLEM", page: "/sales", app_version: "abc1234", status: "PENDING", user_id: anna.id });
    const audit = (await harness.query<{ metadata: Record<string, unknown> }>("SELECT metadata FROM audit_logs WHERE action = 'FEEDBACK_SUBMITTED'")).rows;
    expect(audit[0]?.metadata).toEqual({ kind: "PROBLEM", screenshot: false, log: false });
    expect(JSON.stringify(audit)).not.toContain("Зберегти");
  });

  it("refuses a description under 10 characters and a malformed report", async () => {
    expect((await submit(anna, report({ message: "не працює" }))).status).toBe(400);
    expect((await submit(anna, report({ kind: "SPAM" }))).status).toBe(400);
    const malformed = await request(app).post("/api/v1/feedback").set("Authorization", `Bearer ${anna.token}`).field("report", "{not json");
    expect(malformed.status).toBe(400);
  });

  it("requires sign-in", async () => {
    expect((await request(app).post("/api/v1/feedback").field("report", JSON.stringify(report()))).status).toBe(401);
  });
});

describe("Мои обращения", () => {
  it("lists only the person's own reports, newest first", async () => {
    await submit(boris, report({ message: "Не бачу звіт за вересень у списку" }));
    const list = await mine(anna);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ kind: "PROBLEM", status: "PENDING", hasScreenshot: false, issueNumber: null });
    expect((await mine(boris)).body.data[0].message).toContain("вересень");
  });
});

describe("forced password change", () => {
  it("still lets the person send a report, but nothing else", async () => {
    await harness.query("UPDATE users SET must_change_password = true WHERE id = $1", [boris.id]);
    expect((await submit(boris, report({ message: "Не можу змінити пароль, форма не приймає" }))).status).toBe(201);
    expect((await mine(boris)).status).toBe(403);
    await harness.query("UPDATE users SET must_change_password = false WHERE id = $1", [boris.id]);
  });
});
