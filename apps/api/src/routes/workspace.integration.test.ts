/** Rate limits and self-service profile updates through the Express app and a real Postgres. */
import type { Express, Request } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDbHarness, type TestUser } from "../test/dbHarness";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let anna: TestUser, boris: TestUser;

beforeAll(async () => {
  harness = await startDbHarness();
  app = (await import("../app")).app;
  anna = await harness.user("anna", "EMPLOYEE", "Sales");
  boris = await harness.user("boris", "EMPLOYEE", "Sales");
}, 60_000);

afterAll(async () => harness?.stop());

describe("rate limits", () => {
  it("keys signed-in requests by person, so colleagues behind one IP don't share a budget", async () => {
    const { rateLimitKey, USER_REQUEST_LIMIT, ANONYMOUS_REQUEST_LIMIT } = await import("../middleware");
    const fake = (token?: string) => ({ ip: "203.0.113.7", header: (name: string) => name === "authorization" && token ? `Bearer ${token}` : undefined }) as unknown as Request;
    expect(rateLimitKey(fake(anna.token))).toBe(`user:${anna.id}`);
    expect(rateLimitKey(fake(boris.token))).toBe(`user:${boris.id}`);
    expect(rateLimitKey(fake())).toBe("ip:203.0.113.7");
    expect(rateLimitKey(fake("forged.token.value"))).toBe("ip:203.0.113.7");
    expect(USER_REQUEST_LIMIT).toBe(1500);
    expect(ANONYMOUS_REQUEST_LIMIT).toBe(300);
  });

  it("limits anonymous requests per IP and answers RATE_LIMITED", async () => {
    let last = 0;
    for (let index = 0; index < 301; index += 1) last = (await request(app).get("/api/v1/clients")).status;
    expect(last).toBe(429);
    const limited = await request(app).get("/api/v1/clients");
    expect(limited.body.error.code).toBe("RATE_LIMITED");
    // A signed-in colleague from the same address still gets through.
    expect((await request(app).get("/api/v1/clients").set("Authorization", `Bearer ${anna.token}`)).status).toBe(200);
  }, 60_000);
});

describe("PATCH /team/me", () => {
  const patch = (body: object) => request(app).patch("/api/v1/team/me").set("Authorization", `Bearer ${anna.token}`).send(body);

  it("updates the caller's own name and specialty and audits only field names", async () => {
    const response = await patch({ fullName: "Анна Коваль", specialty: "B2B" });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: anna.id, fullName: "Анна Коваль", specialty: "B2B" });
    const audit = await harness.query<{ metadata: { fields: string[] } }>("SELECT metadata FROM audit_logs WHERE action = 'PROFILE_UPDATED' AND actor_id = $1", [anna.id]);
    expect(audit.rows[0]?.metadata.fields).toEqual(["fullName", "specialty"]);
    expect(JSON.stringify(audit.rows)).not.toContain("Коваль");
  });

  it("clears the specialty with an empty string and keeps the name", async () => {
    const response = await patch({ specialty: "" });
    expect(response.body.data).toMatchObject({ fullName: "Анна Коваль", specialty: null });
  });

  it("rejects an empty body and management-only fields", async () => {
    expect((await patch({})).status).toBe(400);
    expect((await patch({ role: "DIRECTOR" })).status).toBe(400);
    expect((await patch({ fullName: "X", departmentId: anna.departmentId })).status).toBe(400);
    const row = await harness.query<{ role: string }>("SELECT role FROM users WHERE id = $1", [anna.id]);
    expect(row.rows[0]?.role).toBe("EMPLOYEE");
  });
});
