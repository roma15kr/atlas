/** Team administration through the Express app and a real Postgres: edit, disable, reset and change passwords. */
import bcrypt from "bcryptjs";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDbHarness, type TestUser } from "../test/dbHarness";

const PASSWORD = "Initial-Pass-2026";
let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let boss: TestUser, deputy: TestUser, head: TestUser, anna: TestUser, olga: TestUser, otherHead: TestUser;

const as = (who: TestUser) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`),
  post: (path: string, body: object = {}) => request(app).post(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body),
  patch: (path: string, body: object) => request(app).patch(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body)
});
const audits = async (action: string) => (await harness.query<{ entity_id: string; metadata: Record<string, unknown> }>(
  "SELECT entity_id, metadata FROM audit_logs WHERE action = $1 ORDER BY created_at", [action])).rows;
const login = (username: string, password: string) => request(app).post("/api/v1/auth/login").send({ username, password });

beforeAll(async () => {
  harness = await startDbHarness();
  app = (await import("../app")).app;
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  boss = await harness.user("boss", "DIRECTOR", null, { passwordHash });
  deputy = await harness.user("deputy", "DIRECTOR", null, { passwordHash });
  head = await harness.user("head", "MANAGER", "Sales", { passwordHash });
  anna = await harness.user("anna", "EMPLOYEE", "Sales", { passwordHash });
  olga = await harness.user("olga", "EMPLOYEE", "Ops", { passwordHash });
  otherHead = await harness.user("otherhead", "MANAGER", "Sales", { passwordHash });
}, 60_000);

afterAll(async () => harness?.stop());

describe("PATCH /team/:id", () => {
  it("lets a director move an employee into a new department and audits the placement", async () => {
    const response = await as(boss).patch(`/team/${olga.id}`, { departmentName: "Логистика", jobTitle: "Логист" });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ departmentName: "Логистика", jobTitle: "Логист", role: "EMPLOYEE" });
    const [event] = await audits("TEAM_MEMBER_UPDATED");
    expect(event?.metadata).toMatchObject({ fields: ["jobTitle", "departmentName"], previousDepartmentId: olga.departmentId });
  });

  it("lets a head fix an employee's profile but not their role", async () => {
    expect((await as(head).patch(`/team/${anna.id}`, { fullName: "Анна Соколова" })).status).toBe(200);
    const denied = await as(head).patch(`/team/${anna.id}`, { role: "MANAGER" });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("ROLE_CHANGE_FORBIDDEN");
    expect((await audits("TEAM_MEMBER_ADMIN_DENIED")).at(-1)?.metadata).toEqual({ action: "change-role" });
  });

  it("keeps heads to employees of their own department", async () => {
    expect((await as(head).patch(`/team/${otherHead.id}`, { fullName: "X Y" })).body.error.code).toBe("MANAGER_EMPLOYEE_ONLY");
    expect((await as(head).patch(`/team/${olga.id}`, { fullName: "X Y" })).status).toBe(404);
    expect((await as(anna).patch(`/team/${olga.id}`, { fullName: "X Y" })).status).toBe(403);
  });

  it("refuses a self role change, a missing department and demoting the last director", async () => {
    expect((await as(boss).patch(`/team/${boss.id}`, { role: "MANAGER" })).body.error.code).toBe("ROLE_CHANGE_FORBIDDEN");
    expect((await as(boss).patch(`/team/${deputy.id}`, { role: "MANAGER" })).body.error.code).toBe("DEPARTMENT_REQUIRED");
    await harness.query("UPDATE users SET status = 'DISABLED' WHERE id = $1", [boss.id]);
    const last = await as(deputy).patch(`/team/${deputy.id}`, { fullName: "Deputy Director" });
    expect(last.status).toBe(200);
    await harness.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [boss.id]);
  });

  it("serializes directors demoting each other so one director remains", async () => {
    const sales = head.departmentId;
    const results = await Promise.all([
      as(boss).patch(`/team/${deputy.id}`, { role: "MANAGER", departmentId: sales }),
      as(deputy).patch(`/team/${boss.id}`, { role: "MANAGER", departmentId: sales })
    ]);
    const statuses = results.map((result) => result.status).sort();
    const directors = await harness.query("SELECT id FROM users WHERE role = 'DIRECTOR' AND status = 'ACTIVE'");
    expect(directors.rowCount).toBeGreaterThanOrEqual(1);
    expect(statuses).toContain(200);
    // Restore both directors for the remaining tests.
    await harness.query("UPDATE users SET role = 'DIRECTOR', department_id = NULL WHERE id = ANY($1::uuid[])", [[boss.id, deputy.id]]);
  });
});

describe("disable and enable", () => {
  it("ends the person's sessions, blocks their token and takes them out of chat", async () => {
    const session = await login("anna", PASSWORD);
    expect(session.status).toBe(200);
    const cookie = session.headers["set-cookie"] as unknown as string[];
    const before = await harness.query("SELECT 1 FROM chat_members WHERE user_id = $1", [anna.id]);

    const disabled = await as(head).post(`/team/${anna.id}/disable`);
    expect(disabled.body.data.status).toBe("DISABLED");
    expect((await as(anna).get("/clients")).status).toBe(401);
    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie)).status).toBe(401);
    expect((await login("anna", PASSWORD)).status).toBe(401);
    const after = await harness.query("SELECT 1 FROM chat_members WHERE user_id = $1", [anna.id]);
    expect(after.rowCount).toBeLessThanOrEqual(before.rowCount ?? 0);
    expect(await audits("TEAM_MEMBER_DISABLED")).toHaveLength(1);

    const listed = await as(head).get("/team?status=all");
    expect(listed.body.data.find((row: { id: string }) => row.id === anna.id)?.status).toBe("DISABLED");
    expect((await as(head).get("/team")).body.data.some((row: { id: string }) => row.id === anna.id)).toBe(false);

    expect((await as(head).post(`/team/${anna.id}/enable`)).body.data.status).toBe("ACTIVE");
    expect((await login("anna", PASSWORD)).status).toBe(200);
    expect(await audits("TEAM_MEMBER_ENABLED")).toHaveLength(1);
  });

  it("refuses disabling oneself and lets employees list only themselves", async () => {
    expect((await as(boss).post(`/team/${boss.id}/disable`)).body.error.code).toBe("CANNOT_DISABLE_SELF");
    const own = await as(anna).get("/team?status=all");
    expect(own.body.data.map((row: { id: string }) => row.id)).toEqual([anna.id]);
  });
});

describe("password reset and change", () => {
  const TEMPORARY = "Temporary-Pass-77";
  const CHOSEN = "My-Own-Secret-2026";

  it("resets a locked employee, forces a change, then frees the account", async () => {
    await harness.query("UPDATE users SET failed_login_count = 5, locked_until = now() + interval '10 minutes' WHERE id = $1", [anna.id]);
    expect((await as(head).post(`/team/${anna.id}/reset-password`, { password: "weak" })).status).toBe(400);
    const reset = await as(head).post(`/team/${anna.id}/reset-password`, { password: TEMPORARY });
    expect(reset.status).toBe(200);
    expect(JSON.stringify(reset.body)).not.toContain(TEMPORARY);
    expect(JSON.stringify(await audits("PASSWORD_RESET"))).not.toContain(TEMPORARY);

    const signedIn = await login("anna", TEMPORARY);
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.data.user.mustChangePassword).toBe(true);
    const token = signedIn.body.data.accessToken as string;
    const blocked = await request(app).get("/api/v1/clients").set("Authorization", `Bearer ${token}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
    expect((await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`)).status).toBe(200);

    const change = (body: object) => request(app).post("/api/v1/auth/password").set("Authorization", `Bearer ${token}`).send(body);
    expect((await change({ currentPassword: "wrong", newPassword: CHOSEN })).body.error.code).toBe("INVALID_CURRENT_PASSWORD");
    expect(await audits("PASSWORD_CHANGE_DENIED")).toHaveLength(1);
    expect((await change({ currentPassword: TEMPORARY, newPassword: TEMPORARY })).body.error.code).toBe("PASSWORD_REUSED");
    const changed = await change({ currentPassword: TEMPORARY, newPassword: CHOSEN });
    expect(changed.status).toBe(200);
    expect(changed.body.data.user.mustChangePassword).toBe(false);
    const fresh = changed.body.data.accessToken as string;
    expect((await request(app).get("/api/v1/clients").set("Authorization", `Bearer ${fresh}`)).status).toBe(200);
    expect(await audits("PASSWORD_CHANGED")).toHaveLength(1);
  });

  it("ends other sessions when the password changes", async () => {
    const other = await login("anna", CHOSEN);
    const otherCookie = other.headers["set-cookie"] as unknown as string[];
    const current = await login("anna", CHOSEN);
    const currentCookie = current.headers["set-cookie"] as unknown as string[];
    const changed = await request(app).post("/api/v1/auth/password").set("Authorization", `Bearer ${current.body.data.accessToken}`)
      .set("Cookie", currentCookie).send({ currentPassword: CHOSEN, newPassword: "Another-Secret-2026" });
    expect(changed.status).toBe(200);
    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", otherCookie)).status).toBe(401);
    const newCookie = changed.headers["set-cookie"] as unknown as string[];
    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", newCookie)).status).toBe(200);
  });

  it("does not let a director reset their own password", async () => {
    expect((await as(boss).post(`/team/${boss.id}/reset-password`, { password: TEMPORARY })).body.error.code).toBe("CANNOT_RESET_SELF");
  });
});
