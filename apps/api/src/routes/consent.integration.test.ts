/** Presence-based figures only for people who accepted the monitoring policy. */
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDbHarness, type TestUser } from "../test/dbHarness";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let head: TestUser, agreed: TestUser, declined: TestUser;

beforeAll(async () => {
  harness = await startDbHarness();
  app = (await import("../app")).app;
  head = await harness.user("head", "MANAGER", "Sales", { consent: true });
  agreed = await harness.user("agreed", "EMPLOYEE", "Sales", { consent: true });
  declined = await harness.user("declined", "EMPLOYEE", "Sales", { consent: false });
  for (const user of [head, agreed, declined]) {
    await harness.query("INSERT INTO presence_events (company_id, user_id, event, occurred_at) VALUES ($1, $2, 'ONLINE', now() - interval '1 day')", [harness.company, user.id]);
  }
}, 60_000);

afterAll(async () => harness?.stop());

const analyze = (targetUserId: string) => request(app).post("/api/v1/ai/analyze").set("Authorization", `Bearer ${head.token}`).send({ mode: "EVALUATION", targetUserId });
const report = (body: object) => request(app).post("/api/v1/reports").set("Authorization", `Bearer ${head.token}`)
  .send({ name: "Присутствие", metrics: ["attendance"], periodStart: new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10), periodEnd: new Date().toISOString().slice(0, 10), ...body });

describe("consent-gated metrics", () => {
  it("leaves activity out of AI analysis for someone without consent", async () => {
    const without = await analyze(declined.id);
    expect(without.body.data.metrics.presence).toEqual({ consent: false });
    expect(without.body.data.summary).toContain("нет согласия");
    const withConsent = await analyze(agreed.id);
    expect(withConsent.body.data.metrics.presence).toMatchObject({ consent: true, activeDays30: 1 });
  });

  it("marks a personal report without consent and counts only consenting people in a team report", async () => {
    const personal = await report({ targetUserId: declined.id });
    expect(personal.body.data.result.attendance).toEqual({ consent: false });
    const team = await report({});
    expect(team.body.data.result.attendance).toMatchObject({ activeDays: 1, consentingUsers: 2, teamSize: 3 });
  });
});
