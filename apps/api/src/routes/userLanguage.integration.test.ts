/** Each person's interface language: Ukrainian by default, switchable in the profile, carried by the session. */
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let anna: TestUser;
const me = () => request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${anna.token}`);
const patch = (body: object) => request(app).patch("/api/v1/team/me").set("Authorization", `Bearer ${anna.token}`).send(body);

beforeAll(async () => {
  harness = await startDbHarness();
  app = (await import("../app")).app;
  anna = await harness.user("anna", "EMPLOYEE", "Продажі", { consent: true });
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("interface language", () => {
  it("starts in Ukrainian", async () => {
    expect((await me()).body.data.language).toBe("uk");
  });

  it("switches to English, carried by the session, audited by field name", async () => {
    const response = await patch({ language: "en" });
    expect(response.status).toBe(200);
    expect(response.body.data.language).toBe("en");
    expect((await me()).body.data.language).toBe("en");
    const audit = (await harness.query<{ metadata: { fields: string[] } }>(
      "SELECT metadata FROM audit_logs WHERE action = 'PROFILE_UPDATED' AND actor_id = $1 ORDER BY created_at DESC LIMIT 1", [anna.id])).rows[0]!;
    expect(audit.metadata).toEqual({ fields: ["language"] });
  });

  it("rejects a language Atlas doesn't have", async () => {
    expect((await patch({ language: "de" })).status).toBe(400);
    expect((await me()).body.data.language).toBe("en");
  });
});
