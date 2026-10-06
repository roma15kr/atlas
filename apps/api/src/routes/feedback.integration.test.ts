/** In-app problem reports: submitting, listing, screenshots and director access. */
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDbHarness, type TestUser } from "../test/dbHarness";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let anna: TestUser, boris: TestUser, boss: TestUser;

const report = (overrides: Record<string, unknown> = {}) => ({ kind: "PROBLEM", message: "Кнопка «Зберегти» нічого не робить", page: "/sales", appVersion: "abc1234", ...overrides });
const submit = (who: TestUser, body: Record<string, unknown> = report()) =>
  request(app).post("/api/v1/feedback").set("Authorization", `Bearer ${who.token}`).field("report", JSON.stringify(body));
const mine = (who: TestUser) => request(app).get("/api/v1/feedback/mine").set("Authorization", `Bearer ${who.token}`);

beforeAll(async () => {
  harness = await startDbHarness();
  app = (await import("../app")).app;
  anna = await harness.user("anna", "EMPLOYEE", "Sales");
  boris = await harness.user("boris", "EMPLOYEE", "Sales");
  boss = await harness.user("boss", "DIRECTOR", null);
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

describe("screenshot", () => {
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const withShot = (who: TestUser, body: Buffer, name = "screen.png", type = "image/png") =>
    request(app).post("/api/v1/feedback").set("Authorization", `Bearer ${who.token}`).field("report", JSON.stringify(report())).attach("screenshot", body, { filename: name, contentType: type });
  const shot = (who: TestUser, id: string) => request(app).get(`/api/v1/feedback/${id}/screenshot`).set("Authorization", `Bearer ${who.token}`)
    .buffer(true).parse((res, done) => { const chunks: Buffer[] = []; res.on("data", (c: Buffer) => chunks.push(c)); res.on("end", () => done(null, Buffer.concat(chunks))); });

  it("stores a screenshot, recognised by its content, and serves it to the reporter", async () => {
    const sent = await withShot(anna, PNG, "screen.bin", "application/octet-stream");
    expect(sent.status).toBe(201);
    const served = await shot(anna, sent.body.data.id);
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toBe("image/png");
    expect(Buffer.compare(served.body as Buffer, PNG)).toBe(0);
    const audit = (await harness.query<{ metadata: Record<string, unknown> }>("SELECT metadata FROM audit_logs WHERE action = 'FEEDBACK_SUBMITTED' ORDER BY created_at DESC LIMIT 1")).rows[0];
    expect(audit?.metadata).toMatchObject({ screenshot: true });
    expect((await request(app).get("/api/v1/feedback/mine").set("Authorization", `Bearer ${anna.token}`)).body.data[0].hasScreenshot).toBe(true);
  });

  it("refuses a disguised file and one over 3 MB", async () => {
    const disguised = await withShot(anna, Buffer.from("<svg onload=alert(1)>"), "x.png");
    expect(disguised.status).toBe(400);
    expect(disguised.body.error.code).toBe("UNSUPPORTED_IMAGE");
    const huge = await withShot(anna, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(3 * 1024 * 1024 + 10)]), "big.jpg", "image/jpeg");
    expect(huge.status).toBe(413);
  });

  it("hides it from colleagues, shows it to a director and audits the director's view", async () => {
    const sent = await withShot(anna, PNG);
    expect((await shot(boris, sent.body.data.id)).status).toBe(404);
    expect((await shot(boss, sent.body.data.id)).status).toBe(200);
    const viewed = (await harness.query<{ entity_id: string }>("SELECT entity_id FROM audit_logs WHERE action = 'FEEDBACK_VIEWED'")).rows;
    expect(viewed.map((row) => row.entity_id)).toContain(sent.body.data.id);
  });
});
