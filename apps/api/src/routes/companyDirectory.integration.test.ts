/** The company contact directory: everyone sees every active colleague's contacts, nothing more; management stays scoped. */
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let boss: TestUser, salesHead: TestUser, seller: TestUser, heatingHead: TestUser, promoter: TestUser, leaver: TestUser;

const as = (who: TestUser) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`),
  post: (path: string, body: object) => request(app).post(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body),
  patch: (path: string, body: object) => request(app).patch(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body)
});
type Entry = Record<string, unknown> & { id: string; inTeam: boolean };
const directory = async (who: TestUser) => {
  const response = await as(who).get("/team/directory");
  expect(response.status).toBe(200);
  return response.body.data as Entry[];
};

beforeAll(async () => {
  harness = await startDbHarness();
  app = (await import("../app")).app;
  boss = await harness.user("nikonov", "DIRECTOR", "Руководство", { consent: true });
  salesHead = await harness.user("denysiuk", "MANAGER", "Отдел продаж", { consent: true });
  seller = await harness.user("tymoshenko", "EMPLOYEE", "Отдел продаж", { consent: true });
  heatingHead = await harness.user("verbitskyi", "MANAGER", "Отдел промышленного электрообогрева", { consent: true });
  promoter = await harness.user("yelfimov", "EMPLOYEE", "Отдел DIY", { consent: true });
  leaver = await harness.user("zherevko", "EMPLOYEE", "Отдел продаж", { consent: true });
  await harness.query("UPDATE users SET status = 'DISABLED' WHERE id = $1", [leaver.id]);
  await harness.query(
    "UPDATE users SET job_title = 'Менеджер B2B', phone = '+380 67 000 00 01', birth_date = '1990-05-07', show_birthday = true, job_description = 'Веде дилерів' WHERE id = $1",
    [seller.id]);
  await harness.query("UPDATE users SET birth_date = '1995-01-02', show_birthday = false WHERE id = $1", [promoter.id]);
  await harness.query("INSERT INTO kpis (company_id, user_id, name, target, actual, unit, weight) VALUES ($1, $2, 'Продажі', 100, 50, '%', 1)", [harness.company, seller.id]);
  const other = (await harness.query<{ id: string }>("INSERT INTO companies (name) VALUES ('Other') RETURNING id")).rows[0]!.id;
  await harness.query("INSERT INTO users (company_id, username, password_hash, role, full_name) VALUES ($1, 'stranger', 'x', 'EMPLOYEE', 'Stranger')", [other]);
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("company directory", () => {
  it("lets an employee see active colleagues of every department, in their team only themselves", async () => {
    const rows = await directory(promoter);
    expect(rows.map((row) => row.id).sort()).toEqual([boss.id, salesHead.id, seller.id, heatingHead.id, promoter.id].sort());
    expect(rows.filter((row) => row.inTeam).map((row) => row.id)).toEqual([promoter.id]);
    expect(rows.find((row) => row.id === seller.id)).toMatchObject({
      departmentName: "Отдел продаж", role: "EMPLOYEE", jobTitle: "Менеджер B2B", phone: "+380 67 000 00 01", birthday: "05-07"
    });
  });

  it("returns no performance, monitoring or private data", async () => {
    for (const row of await directory(salesHead)) {
      for (const key of ["kpis", "rating", "jobDescription", "monitoringConsentAt", "monitoringConsentVersion", "presence", "birthDate", "showBirthday", "status", "username"]) {
        expect(row).not.toHaveProperty(key);
      }
    }
    // A hidden birthday stays hidden, even from its owner here.
    expect((await directory(promoter)).find((row) => row.id === promoter.id)).not.toHaveProperty("birthday");
  });

  it("marks the caller's team with the usual scope", async () => {
    expect((await directory(salesHead)).filter((row) => row.inTeam).map((row) => row.id).sort()).toEqual([salesHead.id, seller.id].sort());
    expect((await directory(boss)).every((row) => row.inTeam)).toBe(true);
  });

  it("keeps management inside the head's own team", async () => {
    expect((await directory(heatingHead)).find((row) => row.id === seller.id)!.inTeam).toBe(false);
    expect((await as(heatingHead).patch(`/team/${seller.id}`, { jobTitle: "x" })).status).toBe(404);
    expect((await as(heatingHead).post(`/team/${seller.id}/reset-password`, { password: "Temp-Password-2026!" })).status).toBe(404);
    expect((await as(heatingHead).post(`/team/${seller.id}/disable`, {})).status).toBe(404);
    const kpi = await as(heatingHead).post("/kpis", { userId: seller.id, name: "Чужий KPI", target: 1, unit: "%" });
    expect(kpi.status).toBe(404);
    expect((await as(heatingHead).get("/team")).body.data.map((row: { id: string }) => row.id)).toEqual([heatingHead.id]);
    const stored = await harness.query<{ job_title: string }>("SELECT job_title FROM users WHERE id = $1", [seller.id]);
    expect(stored.rows[0]!.job_title).toBe("Менеджер B2B");
  });
});
