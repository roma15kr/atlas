/** Alert rules, deal-aware alert feed and recurring reports against real Postgres. */
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDbHarness, type TestUser } from "../test/dbHarness";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let boss: TestUser, head: TestUser, anna: TestUser, quiet: TestUser, private_: TestUser;
let ids: { open: string; won: string; restrictedOpen: string; restrictedFunnel: string; client: string; board: string; todo: string; done: string; funnel: string };

const as = (who: TestUser) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`),
  post: (path: string, body: object) => request(app).post(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body),
  patch: (path: string, body: object) => request(app).patch(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body),
  delete: (path: string) => request(app).delete(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`)
});
const one = async <T>(sql: string, values: unknown[] = []) => (await harness.query<T & Record<string, unknown>>(sql, values)).rows[0]!;
const openAlerts = async (rule: string) => (await harness.query<{ id: string; severity: string; user_id: string; deal_id: string | null; evidence: Record<string, unknown> }>(
  "SELECT id, severity, user_id, deal_id, evidence FROM alerts WHERE rule = $1 AND resolved_at IS NULL", [rule])).rows;

async function overdueTask(assignee: TestUser): Promise<string> {
  const id = (await one<{ id: string }>(
    `INSERT INTO tasks (company_id, department_id, board_id, stage_id, created_by, title, priority, due_at)
     VALUES ($1, $2, $3, $4, $5, 'Просрочено', 'NORMAL', now() - interval '2 days') RETURNING id`,
    [harness.company, assignee.departmentId, ids.board, ids.todo, assignee.id])).id;
  await harness.query("INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2)", [id, assignee.id]);
  return id;
}

beforeAll(async () => {
  harness = await startDbHarness();
  app = (await import("../app")).app;
  boss = await harness.user("boss", "DIRECTOR", null);
  head = await harness.user("head", "MANAGER", "Sales");
  anna = await harness.user("anna", "EMPLOYEE", "Sales");
  quiet = await harness.user("quiet", "EMPLOYEE", "Sales", { consent: true });
  private_ = await harness.user("private", "EMPLOYEE", "Sales", { consent: false });
  await harness.query("UPDATE users SET created_at = now() - interval '30 days' WHERE id = ANY($1::uuid[])", [[quiet.id, private_.id]]);
  const funnel = (await one<{ id: string }>("INSERT INTO deal_funnels (company_id, name) VALUES ($1, 'Основная') RETURNING id", [harness.company])).id;
  const restrictedFunnel = (await one<{ id: string }>("INSERT INTO deal_funnels (company_id, name, access_mode) VALUES ($1, 'Опт', 'RESTRICTED') RETURNING id", [harness.company])).id;
  await harness.query("INSERT INTO deal_funnel_access (funnel_id, user_id) VALUES ($1, $2)", [restrictedFunnel, anna.id]);
  const stage = async (funnelId: string, name: string, outcome: string) => (await one<{ id: string }>(
    "INSERT INTO deal_stages (company_id, funnel_id, name, color, sort_order, outcome) VALUES ($1, $2, $3, '#6B7280', 1, $4) RETURNING id", [harness.company, funnelId, name, outcome])).id;
  const client = (await one<{ id: string }>("INSERT INTO clients (company_id, department_id, owner_id, name) VALUES ($1, $2, $3, 'Клиент') RETURNING id", [harness.company, anna.departmentId, anna.id])).id;
  const board = (await one<{ id: string }>("INSERT INTO task_boards (company_id, department_id, name, created_by) VALUES ($1, $2, 'Задачи', $3) RETURNING id", [harness.company, anna.departmentId, head.id])).id;
  const boardStage = async (name: string, category: string, order: number) => (await one<{ id: string }>(
    "INSERT INTO task_board_stages (board_id, name, color, sort_order, category) VALUES ($1, $2, '#6B7280', $3, $4) RETURNING id", [board, name, order, category])).id;
  ids = { funnel, restrictedFunnel, open: await stage(funnel, "Новая", "OPEN"), won: await stage(funnel, "Выиграна", "WON"), restrictedOpen: await stage(restrictedFunnel, "Новая", "OPEN"),
    client, board, todo: await boardStage("Нужно сделать", "TODO", 1), done: await boardStage("Готово", "DONE", 2) };
}, 60_000);

afterAll(async () => harness?.stop());

describe("alert rules", () => {
  it("raises one overdue-task alert, escalates it, and resolves it when the tasks are done", async () => {
    const { evaluateAlerts } = await import("./alerts");
    const tasks = [await overdueTask(anna), await overdueTask(anna), await overdueTask(anna)];
    await evaluateAlerts();
    let alerts = (await openAlerts("TASKS_OVERDUE")).filter((alert) => alert.user_id === anna.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ severity: "WARNING", evidence: { overdue: 3 } });

    for (let index = 0; index < 4; index += 1) tasks.push(await overdueTask(anna));
    await evaluateAlerts();
    alerts = (await openAlerts("TASKS_OVERDUE")).filter((alert) => alert.user_id === anna.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ severity: "CRITICAL", evidence: { overdue: 7 } });

    await harness.query("UPDATE tasks SET stage_id = $1, completed_at = now() WHERE id = ANY($2::uuid[])", [ids.done, tasks]);
    await evaluateAlerts();
    expect((await openAlerts("TASKS_OVERDUE")).filter((alert) => alert.user_id === anna.id)).toHaveLength(0);
    expect((await one<{ count: number }>("SELECT count(*)::int AS count FROM alerts WHERE rule = 'TASKS_OVERDUE' AND resolved_at IS NOT NULL")).count).toBe(1);
  });

  it("flags overdue and stalled deals and a KPI behind its period", async () => {
    const { evaluateAlerts } = await import("./alerts");
    const deal = (await one<{ id: string }>(
      `INSERT INTO deals (company_id, department_id, client_id, owner_id, title, funnel_id, stage_id, value, currency, probability, expected_close_at)
       VALUES ($1, $2, $3, $4, 'Поставка', $5, $6, 1000, 'UAH', 50, now() - interval '3 days') RETURNING id`,
      [harness.company, anna.departmentId, ids.client, anna.id, ids.funnel, ids.open])).id;
    await harness.query("ALTER TABLE deals DISABLE TRIGGER deals_updated_at");
    await harness.query("UPDATE deals SET updated_at = now() - interval '20 days' WHERE id = $1", [deal]);
    await harness.query("ALTER TABLE deals ENABLE TRIGGER deals_updated_at");
    await harness.query(`INSERT INTO kpis (company_id, user_id, name, target, actual, unit, weight, source, period_start, period_end)
      VALUES ($1, $2, 'План', 100, 5, 'шт', 1, 'MANUAL', current_date - 20, current_date + 5)`, [harness.company, anna.id]);
    await evaluateAlerts();
    expect((await openAlerts("DEAL_CLOSE_OVERDUE")).map((alert) => alert.deal_id)).toEqual([deal]);
    expect((await openAlerts("DEAL_STALLED")).map((alert) => alert.deal_id)).toEqual([deal]);
    expect((await openAlerts("KPI_BEHIND")).map((alert) => alert.user_id)).toEqual([anna.id]);
  });

  it("looks at presence only for people who accepted the monitoring policy", async () => {
    const { evaluateAlerts } = await import("./alerts");
    await harness.query("INSERT INTO presence_events (company_id, user_id, event, occurred_at) VALUES ($1, $2, 'ONLINE', now() - interval '20 days')", [harness.company, quiet.id]);
    await harness.query("INSERT INTO presence_events (company_id, user_id, event, occurred_at) VALUES ($1, $2, 'ONLINE', now() - interval '20 days')", [harness.company, private_.id]);
    await evaluateAlerts();
    const users = (await openAlerts("INACTIVITY")).map((alert) => alert.user_id);
    expect(users).toContain(quiet.id);
    expect(users).not.toContain(private_.id);
  });

  it("resolves alerts about people who were disabled", async () => {
    const { evaluateAlerts } = await import("./alerts");
    await harness.query("UPDATE users SET status = 'DISABLED' WHERE id = $1", [quiet.id]);
    await evaluateAlerts();
    expect((await openAlerts("INACTIVITY")).map((alert) => alert.user_id)).not.toContain(quiet.id);
    await harness.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [quiet.id]);
  });
});

describe("alert feed", () => {
  it("hides deal alerts from people who can't open the deal's funnel", async () => {
    const { evaluateAlerts } = await import("./alerts");
    const restricted = (await one<{ id: string }>(
      `INSERT INTO deals (company_id, department_id, client_id, owner_id, title, funnel_id, stage_id, value, currency, probability, expected_close_at)
       VALUES ($1, $2, $3, $4, 'Оптовая', $5, $6, 1000, 'UAH', 50, now() - interval '3 days') RETURNING id`,
      [harness.company, anna.departmentId, ids.client, anna.id, ids.restrictedFunnel, ids.restrictedOpen])).id;
    await evaluateAlerts();
    const headFeed = await as(head).get("/alerts");
    expect(headFeed.body.data.some((alert: { dealId: string | null }) => alert.dealId === restricted)).toBe(false);
    const annaFeed = await as(anna).get("/alerts");
    expect(annaFeed.body.data.some((alert: { dealId: string | null }) => alert.dealId === restricted)).toBe(true);
    expect(annaFeed.body.data.every((alert: { userId: string }) => alert.userId === anna.id)).toBe(true);
  });

  it("shows open alerts by default and history with state=all", async () => {
    const open = await as(boss).get("/alerts");
    const all = await as(boss).get("/alerts?state=all");
    expect(open.body.data.every((alert: { resolvedAt: string | null }) => alert.resolvedAt === null)).toBe(true);
    expect(all.body.data.some((alert: { resolvedAt: string | null }) => alert.resolvedAt !== null)).toBe(true);
    const dashboard = await as(boss).get("/dashboard");
    expect(dashboard.body.data.alerts.length).toBeGreaterThan(0);
  });
});

describe("recurring reports", () => {
  it("stores the first run at creation and the next run at 06:00 Kyiv", async () => {
    const created = await as(head).post("/reports", { name: "Ежедневный", metrics: ["deals"], periodStart: "2026-09-01", periodEnd: "2026-09-30", schedule: "DAILY" });
    expect(created.status).toBe(201);
    expect(created.body.data.active).toBe(true);
    const next = new Date(created.body.data.nextRunAt as string);
    expect(next.getTime()).toBeGreaterThan(Date.now());
    expect(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit" }).format(next)).toBe("06:00");
    const runs = await as(head).get(`/reports/${created.body.data.id}/runs`);
    expect(runs.body.data).toHaveLength(1);
  });

  it("runs a due weekly report once for the previous week and schedules the next Monday", async () => {
    const { runDueReports } = await import("./reports");
    const created = await as(head).post("/reports", { name: "Неделя", metrics: ["tasks"], periodStart: "2026-09-01", periodEnd: "2026-09-07", schedule: "WEEKLY" });
    const id = created.body.data.id as string;
    await harness.query("UPDATE reports SET next_run_at = now() - interval '3 days' WHERE id = $1", [id]);
    expect(await runDueReports()).toBeGreaterThanOrEqual(1);
    expect(await runDueReports()).toBe(0);
    const expected = await one<{ start: string; end: string }>(
      `SELECT to_char(date_trunc('week', (now() AT TIME ZONE 'Europe/Kyiv')::date)::date - 7, 'YYYY-MM-DD') AS start,
              to_char(date_trunc('week', (now() AT TIME ZONE 'Europe/Kyiv')::date)::date - 1, 'YYYY-MM-DD') AS end`);
    const runs = await as(head).get(`/reports/${id}/runs`);
    expect(runs.body.data).toHaveLength(2);
    expect(runs.body.data[0]).toMatchObject({ periodStart: expected.start, periodEnd: expected.end });
    const report = await one<{ next: Date; dow: number }>(
      "SELECT next_run_at AS next, extract(isodow FROM next_run_at AT TIME ZONE 'Europe/Kyiv')::int AS dow FROM reports WHERE id = $1", [id]);
    expect(report.dow).toBe(1);
    expect(new Date(report.next).getTime()).toBeGreaterThan(Date.now());
    expect((await harness.query("SELECT 1 FROM audit_logs WHERE action = 'REPORT_RUN_COMPLETED' AND actor_id IS NULL")).rowCount).toBeGreaterThanOrEqual(1);
  });

  it("pauses a due report whose creator was disabled", async () => {
    const { runDueReports } = await import("./reports");
    const leaver = await harness.user("leaver", "MANAGER", "Sales");
    const created = await as(leaver).post("/reports", { name: "Месяц", metrics: ["kpi"], periodStart: "2026-08-01", periodEnd: "2026-08-31", schedule: "MONTHLY" });
    const id = created.body.data.id as string;
    await harness.query("UPDATE users SET status = 'DISABLED' WHERE id = $1", [leaver.id]);
    await harness.query("UPDATE reports SET next_run_at = now() - interval '1 hour' WHERE id = $1", [id]);
    await runDueReports();
    expect((await one<{ active: boolean }>("SELECT active FROM reports WHERE id = $1", [id])).active).toBe(false);
    expect((await harness.query("SELECT 1 FROM report_runs WHERE report_id = $1", [id])).rowCount).toBe(1);
    const audit = await one<{ metadata: { reason: string } }>("SELECT metadata FROM audit_logs WHERE action = 'REPORT_SCHEDULE_PAUSED' AND entity_id = $1", [id]);
    expect(audit.metadata.reason).toBe("creator_unavailable");
  });

  it("lets heads pause, resume and delete department reports, and refuses employees", async () => {
    const created = await as(head).post("/reports", { name: "Пауза", metrics: ["deals"], periodStart: "2026-09-01", periodEnd: "2026-09-30", schedule: "DAILY", targetUserId: anna.id });
    const id = created.body.data.id as string;
    expect((await as(head).patch(`/reports/${id}`, { active: false })).body.data.active).toBe(false);
    expect((await as(head).patch(`/reports/${id}`, { active: true })).body.data.active).toBe(true);
    expect((await as(anna).get(`/reports/${id}/runs`)).status).toBe(200);
    expect((await as(anna).delete(`/reports/${id}`)).status).toBe(403);
    expect((await as(head).delete(`/reports/${id}`)).status).toBe(204);
    expect((await as(boss).get(`/reports/${id}/runs`)).status).toBe(404);
  });
});
