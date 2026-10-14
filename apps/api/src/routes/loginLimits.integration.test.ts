/** Login limits count per person, so colleagues behind one office IP don't block each other. */
import bcrypt from "bcryptjs";
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PASSWORD = "Correct-Password-2026!";
let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let boss: TestUser;

const login = (username: string, password = "Wrong-Password-2026") => request(app).post("/api/v1/auth/login").send({ username, password });

beforeAll(async () => {
  harness = await startDbHarness();
  app = (await import("../app")).app;
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  boss = await harness.user("nikonov", "DIRECTOR", null, { passwordHash, consent: true });
  await harness.user("kovalchuk", "EMPLOYEE", "Отдел продаж", { passwordHash, consent: true });
  await harness.user("trubylo", "EMPLOYEE", "Отдел продаж", { passwordHash, consent: true });
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("login limits", () => {
  it("shows the director a denied login for an unknown username, with what was typed", async () => {
    expect((await login("+38 (067) 445-38-58")).status).toBe(401);
    const audit = await request(app).get("/api/v1/audit?action=AUTH_LOGIN_DENIED").set("Authorization", `Bearer ${boss.token}`);
    expect(audit.body.data.map((row: { metadata: { username?: string } }) => row.metadata.username)).toContain("+38 (067) 445-38-58");
    const stored = await harness.query<{ metadata: Record<string, unknown> }>("SELECT metadata FROM audit_logs WHERE action = 'AUTH_LOGIN_DENIED' ORDER BY id DESC LIMIT 1");
    expect(stored.rows[0]!.metadata).toEqual({ username: "+38 (067) 445-38-58" });
  });

  it("limits one username from an address, while a colleague from the same office still signs in", async () => {
    // 1 failure from the previous case + 11 more reach the per-username limit of 12.
    for (let attempt = 0; attempt < 11; attempt += 1) expect((await login("+38 (067) 445-38-58")).status).toBe(401);
    const limited = await login("+38 (067) 445-38-58");
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("LOGIN_RATE_LIMITED");
    expect(limited.headers.ratelimit).toMatch(/reset=\d+/);
    expect((await login("kovalchuk", PASSWORD)).status).toBe(200);
    // Typos of other usernames still get a normal answer.
    expect((await login("denisyuk")).status).toBe(401);
  });

  it("stops any login from an address after 60 failures across usernames", async () => {
    // So far: 13 counted failures (12 + the limited one) and 1 more ("denisyuk") = 14.
    for (let attempt = 0; attempt < 46; attempt += 1) expect((await login(`guess-${attempt}`)).status).toBe(401);
    const blocked = await login("trubylo", PASSWORD);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("LOGIN_RATE_LIMITED");
  }, 60_000);
});
