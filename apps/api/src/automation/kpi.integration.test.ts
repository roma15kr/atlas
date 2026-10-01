/** KPI management, automatic KPIs, deal close dates, achievements and the automation lock, against real Postgres. */
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDbHarness, type TestUser } from "../test/dbHarness";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let boss: TestUser, head: TestUser, peerHead: TestUser, anna: TestUser, olga: TestUser;
let ids: { funnel: string; open: string; won: string; lost: string; client: string; board: string; todo: string; done: string };

const as = (who: TestUser) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`),
  post: (path: string, body: object) => request(app).post(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body),
  patch: (path: string, body: object) => request(app).patch(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body),
  delete: (path: string) => request(app).delete(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`)
});
const one = async <T>(sql: string, values: unknown[] = []) => (await harness.query<T & Record<string, unknown>>(sql, values)).rows[0]!;

async function deal(owner: TestUser, stage: string, title = "Сделка"): Promise<string> {
  return (await one<{ id: string }>(
    `INSERT INTO deals (company_id, department_id, client_id, owner_id, title, funnel_id, stage_id, value, currency, probability)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 1000, 'UAH', 50) RETURNING id`,
    [harness.company, owner.departmentId, ids.client, owner.id, title, ids.funnel, stage])).id;
}

async function task(assignee: TestUser, dueAt: Date | null, completedAt: Date | null): Promise<string> {
  const id = (await one<{ id: string }>(
    `INSERT INTO tasks (company_id, department_id, board_id, stage_id, created_by, title, priority, due_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, 'Задача', 'NORMAL', $6, $7) RETURNING id`,
    [harness.company, assignee.departmentId, ids.board, completedAt ? ids.done : ids.todo, assignee.id, dueAt, completedAt])).id;
  await harness.query("INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2)", [id, assignee.id]);
  return id;
}

beforeAll(async () => {
  harness = await startDbHarness();
  app = (await import("../app")).app;
  boss = await harness.user("boss", "DIRECTOR", null);
  head = await harness.user("head", "MANAGER", "Sales");
  peerHead = await harness.user("peer", "MANAGER", "Sales");
  anna = await harness.user("anna", "EMPLOYEE", "Sales");
  olga = await harness.user("olga", "EMPLOYEE", "Ops");
  const funnel = (await one<{ id: string }>("INSERT INTO deal_funnels (company_id, name) VALUES ($1, 'Основная') RETURNING id", [harness.company])).id;
  const stage = async (name: string, outcome: string, order: number) => (await one<{ id: string }>(
    "INSERT INTO deal_stages (company_id, funnel_id, name, color, sort_order, outcome) VALUES ($1, $2, $3, '#6B7280', $4, $5) RETURNING id",
    [harness.company, funnel, name, order, outcome])).id;
  const client = (await one<{ id: string }>("INSERT INTO clients (company_id, department_id, owner_id, name) VALUES ($1, $2, $3, 'Клиент') RETURNING id",
    [harness.company, anna.departmentId, anna.id])).id;
  const board = (await one<{ id: string }>("INSERT INTO task_boards (company_id, department_id, name, created_by) VALUES ($1, $2, 'Задачи', $3) RETURNING id",
    [harness.company, anna.departmentId, head.id])).id;
  const boardStage = async (name: string, category: string, order: number) => (await one<{ id: string }>(
    "INSERT INTO task_board_stages (board_id, name, color, sort_order, category) VALUES ($1, $2, '#6B7280', $3, $4) RETURNING id", [board, name, order, category])).id;
  ids = { funnel, open: await stage("Новая", "OPEN", 1), won: await stage("Выиграна", "WON", 2), lost: await stage("Проиграна", "LOST", 3), client, board,
    todo: await boardStage("Нужно сделать", "TODO", 1), done: await boardStage("Готово", "DONE", 2) };
}, 60_000);

afterAll(async () => harness?.stop());

describe("KPI management", () => {
  it("lets a head set a manual KPI for their employee and counts it in the rating", async () => {
    const created = await as(head).post("/kpis", { userId: anna.id, name: "Встречи", target: 20, unit: "встреч", weight: 1, actual: 10 });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ source: "MANUAL", target: 20, actual: 10 });
    const team = await as(anna).get("/team");
    expect(team.body.data[0].rating).toBe(50);
    expect((await harness.query("SELECT 1 FROM audit_logs WHERE action = 'KPI_CREATED'")).rowCount).toBe(1);
  });

  it("keeps heads to employees of their own department and audits denials", async () => {
    const peer = await as(head).post("/kpis", { userId: peerHead.id, name: "План", target: 5, unit: "шт" });
    expect(peer.status).toBe(403);
    expect(peer.body.error.code).toBe("KPI_MANAGER_ONLY");
    expect((await as(head).post("/kpis", { userId: olga.id, name: "План", target: 5, unit: "шт" })).status).toBe(404);
    expect((await harness.query("SELECT 1 FROM audit_logs WHERE action = 'KPI_CHANGE_DENIED'")).rowCount).toBe(1);
  });

  it("lets employees read only their own KPIs and change none", async () => {
    const own = await as(anna).get(`/kpis?userId=${olga.id}`);
    expect(own.body.data.every((row: { userId: string }) => row.userId === anna.id)).toBe(true);
    const kpi = own.body.data[0].id as string;
    const denied = await as(anna).patch(`/kpis/${kpi}`, { actual: 20 });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("KPI_MANAGER_ONLY");
    expect((await as(anna).delete(`/kpis/${kpi}`)).status).toBe(403);
  });

  it("measures automatic KPIs, fixes their unit and rejects a manual actual", async () => {
    const rejected = await as(head).post("/kpis", { userId: anna.id, source: "TASKS_DONE", name: "Задачи", target: 10, actual: 3 });
    expect(rejected.body.error.code).toBe("KPI_ACTUAL_COMPUTED");
    const created = await as(head).post("/kpis", { userId: anna.id, source: "DEALS_WON_COUNT", name: "Сделки", target: 4 });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ unit: "сделок", actual: 0 });
    expect(created.body.data.periodStart).toMatch(/^\d{4}-\d{2}-01$/);
    const id = created.body.data.id as string;
    expect((await as(head).patch(`/kpis/${id}`, { source: "MANUAL" })).body.error.code).toBe("KPI_SOURCE_LOCKED");
    expect((await as(head).patch(`/kpis/${id}`, { actual: 2 })).body.error.code).toBe("KPI_ACTUAL_COMPUTED");
    expect((await as(head).patch(`/kpis/${id}`, { periodStart: "2026-12-01", periodEnd: "2026-11-01" })).body.error.code).toBe("INVALID_KPI_PERIOD");
  });
});

describe("automatic measures", () => {
  it("counts deals won in the period and ignores other deals", async () => {
    const { recomputeKpis } = await import("./kpis");
    const kpi = (await one<{ id: string }>(`INSERT INTO kpis (company_id, user_id, name, target, unit, weight, source, period_start, period_end)
      VALUES ($1, $2, 'Выручка', 5000, 'UAH', 1, 'DEALS_WON_VALUE', date_trunc('month', current_date), current_date + 30) RETURNING id`, [harness.company, anna.id])).id;
    const inPeriod = await deal(anna, ids.open);
    await harness.query("UPDATE deals SET stage_id = $1 WHERE id = $2", [ids.won, inPeriod]);
    const old = await deal(anna, ids.won);
    await harness.query("UPDATE deals SET closed_at = now() - interval '400 days' WHERE id = $1", [old]);
    await deal(anna, ids.lost);
    await recomputeKpis([kpi]);
    expect((await one<{ actual: string }>("SELECT actual FROM kpis WHERE id = $1", [kpi])).actual).toBe("1000.00");
  });

  it("measures tasks done and the on-time rate, counting open overdue tasks as late", async () => {
    const { recomputeKpis } = await import("./kpis");
    const hour = 3_600_000, now = Date.now();
    await task(olga, new Date(now - 2 * hour), new Date(now - 3 * hour));
    await task(olga, new Date(now - 2 * hour), new Date(now - hour));
    await task(olga, new Date(now - hour), null);
    await task(olga, new Date(now + 48 * hour), null);
    const insert = async (source: string) => (await one<{ id: string }>(`INSERT INTO kpis (company_id, user_id, name, target, unit, weight, source, period_start, period_end)
      VALUES ($1, $2, $3, 10, 'x', 1, $3, current_date - 1, current_date + 5) RETURNING id`, [harness.company, olga.id, source])).id;
    const done = await insert("TASKS_DONE"), rate = await insert("TASKS_ON_TIME_RATE");
    await recomputeKpis([done, rate]);
    expect(Number((await one<{ actual: string }>("SELECT actual FROM kpis WHERE id = $1", [done])).actual)).toBe(2);
    expect(Number((await one<{ actual: string }>("SELECT actual FROM kpis WHERE id = $1", [rate])).actual)).toBeCloseTo(33.33, 1);
  });

  it("freezes a KPI whose period ended more than 2 days ago", async () => {
    const { recomputeKpis } = await import("./kpis");
    const kpi = (await one<{ id: string }>(`INSERT INTO kpis (company_id, user_id, name, target, actual, unit, weight, source, period_start, period_end)
      VALUES ($1, $2, 'Прошлый', 5, 7, 'сделок', 1, 'DEALS_WON_COUNT', current_date - 60, current_date - 10) RETURNING id`, [harness.company, anna.id])).id;
    await recomputeKpis();
    expect((await one<{ actual: string }>("SELECT actual FROM kpis WHERE id = $1", [kpi])).actual).toBe("7.00");
  });
});

describe("deal close date", () => {
  it("stamps on winning, keeps an explicit date and clears on reopening", async () => {
    const id = await deal(anna, ids.open);
    expect((await one<{ closed_at: Date | null }>("SELECT closed_at FROM deals WHERE id = $1", [id])).closed_at).toBeNull();
    const moved = await as(anna).patch(`/deals/${id}`, { stageId: ids.won });
    expect(moved.status).toBe(200);
    expect(moved.body.data.closedAt).not.toBeNull();
    await as(anna).patch(`/deals/${id}`, { closedAt: "2026-01-15T10:00:00.000Z" });
    expect((await one<{ closed_at: Date }>("SELECT closed_at FROM deals WHERE id = $1", [id])).closed_at.toISOString()).toBe("2026-01-15T10:00:00.000Z");
    await as(anna).patch(`/deals/${id}`, { stageId: ids.open });
    expect((await one<{ closed_at: Date | null }>("SELECT closed_at FROM deals WHERE id = $1", [id])).closed_at).toBeNull();
  });
});

describe("achievements", () => {
  it("awards ON_TIME_10 once, only for ten on-time tasks in a row and never to disabled users", async () => {
    const { awardAchievements } = await import("./achievements");
    await harness.query(`INSERT INTO achievement_definitions (company_id, code, name, description, icon, points) VALUES
      ($1, 'ON_TIME_10', 'On-time streak', 'x', 'target', 100), ($1, 'ZERO_OVERDUE', 'Clear runway', 'x', 'sparkles', 150), ($1, 'TOP_MONTH', 'Top result', 'x', 'trophy', 250)`, [harness.company]);
    const lucky = await harness.user("lucky", "EMPLOYEE", "Sales");
    const late = await harness.user("late", "EMPLOYEE", "Sales");
    const gone = await harness.user("gone", "EMPLOYEE", "Sales");
    const day = 86_400_000, start = Date.now() - 30 * day;
    for (let index = 0; index < 10; index += 1) {
      for (const person of [lucky, late, gone]) {
        const lateOne = person === late && index === 9;
        await task(person, new Date(start + index * day + day), new Date(start + index * day + (lateOne ? 2 * day : 0)));
      }
    }
    await harness.query("UPDATE users SET status = 'DISABLED' WHERE id = $1", [gone.id]);
    const first = await awardAchievements();
    const onTime = first.filter((award) => award.code === "ON_TIME_10").map((award) => award.user_id);
    expect(onTime).toEqual([lucky.id]);
    expect((await awardAchievements()).filter((award) => award.code === "ON_TIME_10")).toHaveLength(0);
    const audit = await harness.query<{ actor_id: string | null; metadata: { code: string } }>("SELECT actor_id, metadata FROM audit_logs WHERE action = 'ACHIEVEMENT_AWARDED'");
    expect(audit.rows.some((row) => row.actor_id === null && row.metadata.code === "ON_TIME_10")).toBe(true);
  });
});

describe("monthly achievements", () => {
  it("awards ZERO_OVERDUE for a clean previous month with at least 5 tasks", async () => {
    const { awardAchievements } = await import("./achievements");
    const clean = await harness.user("clean", "EMPLOYEE", "Sales");
    const sloppy = await harness.user("sloppy", "EMPLOYEE", "Sales");
    const few = await harness.user("few", "EMPLOYEE", "Sales");
    const due = (day: number) => new Date(Date.UTC(2026, 7, day, 9));
    for (let day = 3; day <= 7; day += 1) {
      await task(clean, due(day), due(day - 1));
      await task(sloppy, due(day), day === 7 ? due(9) : due(day - 1));
    }
    for (let day = 3; day <= 6; day += 1) await task(few, due(day), due(day - 1));
    const awards = await awardAchievements("2026-09-15");
    const winners = awards.filter((award) => award.code === "ZERO_OVERDUE").map((award) => award.user_id);
    expect(winners).toContain(clean.id);
    expect(winners).not.toContain(sloppy.id);
    expect(winners).not.toContain(few.id);
  });

  it("awards TOP_MONTH only on the first day, to the best non-director rating above zero", async () => {
    const { awardAchievements } = await import("./achievements");
    await harness.query("DELETE FROM kpis");
    const star = await harness.user("star", "EMPLOYEE", "Sales");
    const kpi = (user: TestUser, actual: number) => harness.query(
      "INSERT INTO kpis (company_id, user_id, name, target, actual, unit, weight) VALUES ($1, $2, 'План', 10, $3, 'шт', 1)", [harness.company, user.id, actual]);
    await kpi(star, 11); await kpi(anna, 6); await kpi(boss, 12);
    expect((await awardAchievements("2026-09-15")).filter((award) => award.code === "TOP_MONTH")).toHaveLength(0);
    const winners = (await awardAchievements("2026-10-01")).filter((award) => award.code === "TOP_MONTH").map((award) => award.user_id);
    expect(winners).toEqual([star.id]);
  });
});

describe("automation scheduler", () => {
  // PGlite serves every connection from one backend, so advisory-lock exclusion between processes
  // can't be shown here; the lock follows the mail scheduler's pattern. This checks step isolation.
  it("keeps running later steps when one fails and releases its lock", async () => {
    const { registerAutomationStep, runAutomation } = await import("./scheduler");
    const ran: string[] = [];
    registerAutomationStep({ name: "test-broken", run: async () => { ran.push("broken"); throw new Error("boom"); } });
    registerAutomationStep({ name: "test-after", run: async () => { ran.push("after"); } });
    expect(await runAutomation()).toBe(true);
    expect(ran).toEqual(["broken", "after"]);
    expect(await runAutomation()).toBe(true);
  });
});
