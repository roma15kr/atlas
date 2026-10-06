/** The feedback processing step: triage, waiting without configuration, retries and limits. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Triage } from "../feedback/triage";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let processFeedback: typeof import("./feedback").processFeedback;
let anna: TestUser;
const triaged: Triage = { language: "uk", title: "Deal changes disappear", summary: "Changes vanish.", translation: "[person] cannot save.", steps: ["Open a deal"], category: "BUG", severity: "HIGH", area: "sales-pipeline" };
const at = (iso: string) => new Date(iso);

async function addReport(message = "Після «Зберегти» зміни зникають"): Promise<string> {
  return (await harness.query<{ id: string }>(
    `INSERT INTO feedback_reports (company_id, user_id, kind, message, page, diagnostics)
     SELECT company_id, id, 'PROBLEM', $2, '/sales', $3::jsonb FROM users WHERE id = $1 RETURNING id`,
    [anna.id, message, JSON.stringify({ events: [{ type: "request", method: "PATCH", path: "/api/v1/deals/1", status: 500, requestId: "secret-id" }] })]
  )).rows[0]!.id;
}
const row = async (id: string) => (await harness.query<{ status: string; attempts: number; title_en: string | null; triaged_at: Date | null; next_attempt_at: Date | null; last_error: string | null; area: string | null }>(
  "SELECT status, attempts, title_en, triaged_at, next_attempt_at, last_error, area FROM feedback_reports WHERE id = $1", [id])).rows[0]!;

beforeAll(async () => {
  harness = await startDbHarness();
  processFeedback = (await import("./feedback")).processFeedback;
  anna = await harness.user("anna", "EMPLOYEE", "Sales");
}, 60_000);
beforeEach(async () => { await harness.query("DELETE FROM feedback_reports"); });
afterAll(async () => harness?.stop());

describe("processFeedback", () => {
  it("leaves reports waiting while neither OpenAI nor GitHub is configured", async () => {
    const id = await addReport();
    expect(await processFeedback(new Date(), { canTriage: () => false })).toEqual({ processed: 0, failed: 0 });
    expect((await row(id)).status).toBe("PENDING");
  });

  it("stores the triage and keeps the report waiting until GitHub is configured", async () => {
    const id = await addReport();
    const triage = vi.fn(async () => triaged);
    expect(await processFeedback(at("2026-10-06T10:00:00Z"), { canTriage: () => true, triage })).toEqual({ processed: 1, failed: 0 });
    expect(triage).toHaveBeenCalledWith({ kind: "PROBLEM", message: "Після «Зберегти» зміни зникають", page: "/sales", errors: ["PATCH /api/v1/deals/1 500"] });
    expect(await row(id)).toMatchObject({ status: "PENDING", title_en: "Deal changes disappear", area: "sales-pipeline", attempts: 0 });
    // Already triaged and GitHub still missing: it isn't sent to the model again.
    await processFeedback(at("2026-10-06T10:10:00Z"), { canTriage: () => true, triage });
    expect(triage).toHaveBeenCalledTimes(1);
  });

  it("retries a failure after 1, 2, 4 and 8 minutes and stops after 5 attempts", async () => {
    const id = await addReport();
    const triage = vi.fn(async () => { throw new Error("OpenAI returned 503"); });
    let clock = Date.parse("2026-10-06T10:00:00Z");
    const delays: number[] = [];
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await processFeedback(new Date(clock), { canTriage: () => true, triage });
      const current = await row(id);
      expect(current).toMatchObject({ status: "FAILED", attempts: attempt, last_error: "OpenAI returned 503" });
      delays.push((current.next_attempt_at!.getTime() - clock) / 60_000);
      // Not due yet: nothing happens.
      await processFeedback(new Date(clock + 30_000), { canTriage: () => true, triage });
      clock = current.next_attempt_at!.getTime();
    }
    expect(delays).toEqual([1, 2, 4, 8, 16]);
    expect(triage).toHaveBeenCalledTimes(5);
    await processFeedback(new Date(clock + 3_600_000), { canTriage: () => true, triage });
    expect(triage).toHaveBeenCalledTimes(5);
  });

  it("puts a report stuck in processing back in the queue", async () => {
    const id = await addReport();
    await harness.query("UPDATE feedback_reports SET status = 'PROCESSING' WHERE id = $1", [id]);
    await harness.query("ALTER TABLE feedback_reports DISABLE TRIGGER feedback_reports_updated_at");
    await harness.query("UPDATE feedback_reports SET updated_at = now() - interval '1 hour' WHERE id = $1", [id]);
    await harness.query("ALTER TABLE feedback_reports ENABLE TRIGGER feedback_reports_updated_at");
    await processFeedback(new Date(), { canTriage: () => true, triage: async () => triaged });
    expect((await row(id)).title_en).toBe("Deal changes disappear");
  });
});

describe("filing GitHub issues", () => {
  it("creates exactly one issue per report even when two runs overlap, and audits it", async () => {
    const ids = [await addReport("Перша проблема з угодами"), await addReport("Друга проблема з задачами")];
    let next = 100;
    const fileIssue = vi.fn(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); next += 1; return { number: next, url: `https://github.com/roma15kr/atlas/issues/${next}` }; });
    const deps = { canTriage: () => true, canFile: () => true, triage: async () => triaged, fileIssue };
    await Promise.all([processFeedback(new Date(), deps), processFeedback(new Date(), deps)]);
    expect(fileIssue).toHaveBeenCalledTimes(2);
    const rows = (await harness.query<{ status: string; issue_number: number }>("SELECT status, issue_number FROM feedback_reports ORDER BY created_at")).rows;
    expect(rows.map((row) => row.status)).toEqual(["ISSUE_CREATED", "ISSUE_CREATED"]);
    expect(new Set(rows.map((row) => row.issue_number)).size).toBe(2);
    await processFeedback(new Date(), deps);
    expect(fileIssue).toHaveBeenCalledTimes(2);
    const audits = (await harness.query<{ entity_id: string; actor_id: string | null }>("SELECT entity_id, actor_id FROM audit_logs WHERE action = 'FEEDBACK_ISSUE_CREATED'")).rows;
    expect(audits.map((row) => row.entity_id).sort()).toEqual([...ids].sort());
    expect(audits.every((row) => row.actor_id === null)).toBe(true);
  });

  it("files a report triaged earlier once GitHub is configured, without translating it again", async () => {
    const id = await addReport();
    const triage = vi.fn(async () => triaged);
    await processFeedback(new Date(), { canTriage: () => true, canFile: () => false, triage });
    const fileIssue = vi.fn(async () => ({ number: 7, url: "https://github.com/roma15kr/atlas/issues/7" }));
    await processFeedback(new Date(), { canTriage: () => true, canFile: () => true, triage, fileIssue });
    expect(triage).toHaveBeenCalledTimes(1);
    expect((await row(id)).status).toBe("ISSUE_CREATED");
    const source = (fileIssue.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(source).toMatchObject({ id, title_en: "Deal changes disappear", area: "sales-pipeline" });
    expect(source).not.toHaveProperty("message");
    expect(JSON.stringify(source)).not.toContain("Зберегти");
  });

  it("keeps a report failed with the reason when GitHub refuses", async () => {
    const id = await addReport();
    await processFeedback(new Date(), { canTriage: () => true, canFile: () => true, triage: async () => triaged, fileIssue: async () => { throw new Error("GitHub returned 502"); } });
    expect(await row(id)).toMatchObject({ status: "FAILED", attempts: 1, last_error: "GitHub returned 502", title_en: "Deal changes disappear" });
  });
});
