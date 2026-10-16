/** An overdue-tasks alert names its tasks for the viewer: visible, not done, oldest first, and how many more. */
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let boss: TestUser, head: TestUser, seller: TestUser, storekeeper: TestUser;
let board: string, alert: string;
const tasks: Record<string, string> = {};

const as = (who: TestUser) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`),
  post: (path: string, body: object) => request(app).post(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body),
  patch: (path: string, body: object) => request(app).patch(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body)
});
type AlertRow = { id: string; rule: string; tasks?: Array<{ id: string; title: string; boardName: string; dueAt: string }>; more?: number };
const overdueAlert = async (who: TestUser) => ((await as(who).get("/alerts")).body.data as AlertRow[]).find((row) => row.id === alert)!;

beforeAll(async () => {
  harness = await startDbHarness();
  const { memoryPresenceStore, setPresenceStore } = await import("../presence");
  setPresenceStore(memoryPresenceStore());
  app = (await import("../app")).app;
  boss = await harness.user("nikonov", "DIRECTOR", "Руководство", { consent: true });
  head = await harness.user("denysiuk", "MANAGER", "Отдел продаж", { consent: true });
  seller = await harness.user("kharrud", "EMPLOYEE", "Отдел продаж", { consent: true });
  storekeeper = await harness.user("kosian", "EMPLOYEE", "Склад", { consent: true });
  board = (await harness.query<{ id: string }>("SELECT id FROM task_boards WHERE department_id = $1", [head.departmentId])).rows[0]!.id;
  const storeBoard = (await harness.query<{ id: string }>("SELECT id FROM task_boards WHERE department_id = $1", [storekeeper.departmentId])).rows[0]!.id;
  const make = async (who: TestUser, boardId: string, title: string, dueAt: string, assigneeIds?: string[]) =>
    (await as(who).post("/tasks", { boardId, title, dueAt, ...(assigneeIds ? { assigneeIds } : {}) })).body.data.id as string;
  tasks.oldest = await make(head, board, "Рахунок Нанокабель", "2026-10-05T09:00:00.000Z", [seller.id]);
  tasks.middle = await make(head, board, "Забрати Нексанс", "2026-10-09T09:00:00.000Z", [seller.id]);
  tasks.newest = await make(seller, board, "Особисте нагадування", "2026-10-12T09:00:00.000Z");
  // Not something the head oversees: a storekeeper's personal task (only to prove the filter).
  tasks.hidden = await make(storekeeper, storeBoard, "Інвентаризація", "2026-10-06T09:00:00.000Z");
  alert = (await harness.query<{ id: string }>(
    `INSERT INTO alerts (company_id, department_id, user_id, severity, category, title, summary, evidence, rule, dedupe_key)
     VALUES ($1, $2, $3, 'WARNING', 'TASKS', 'Просроченные задачи', 'Харруд: просрочено задач — 6', $4, 'TASKS_OVERDUE', 'tasks_overdue:test') RETURNING id`,
    [harness.company, head.departmentId, seller.id, JSON.stringify({ overdue: 6, taskIds: [tasks.newest, tasks.hidden, tasks.oldest, tasks.middle] })])).rows[0]!.id;
  await harness.query(
    `INSERT INTO alerts (company_id, department_id, user_id, severity, category, title, summary, evidence, rule)
     VALUES ($1, $2, $3, 'INFO', 'KPI', 'KPI отстаёт', 'План 40%', '{"kpiId":null}', 'KPI_BEHIND')`, [harness.company, head.departmentId, seller.id]);
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("overdue tasks in alerts", () => {
  it("lists the tasks oldest first with board and due date, and how many more there are", async () => {
    const row = await overdueAlert(boss);
    expect(row.tasks!.map((task) => task.title)).toEqual(["Рахунок Нанокабель", "Інвентаризація", "Забрати Нексанс", "Особисте нагадування"]);
    expect(row.tasks![0]).toMatchObject({ id: tasks.oldest, boardName: "Задачи отдела", dueAt: expect.stringMatching(/^2026-10-05/) });
    expect(row.more).toBe(2);
  });

  it("shows a head only the tasks they may open, counting the rest", async () => {
    const row = await overdueAlert(head);
    expect(row.tasks!.map((task) => task.id)).toEqual([tasks.oldest, tasks.middle, tasks.newest]);
    expect(row.more).toBe(3);
  });

  it("drops a task once it is done, and adds tasks to the dashboard's alerts too", async () => {
    const done = (await harness.query<{ id: string }>("SELECT id FROM task_board_stages WHERE board_id = $1 AND category = 'DONE' LIMIT 1", [board])).rows[0]!.id;
    expect((await as(head).patch(`/tasks/${tasks.middle}`, { stageId: done })).status).toBe(200);
    expect((await overdueAlert(head)).tasks!.map((task) => task.id)).toEqual([tasks.oldest, tasks.newest]);
    const dashboard = (await as(boss).get("/dashboard")).body.data.alerts as AlertRow[];
    expect(dashboard.find((row) => row.id === alert)!.tasks!.map((task) => task.id)).toEqual([tasks.oldest, tasks.hidden, tasks.newest]);
  });

  it("adds nothing to other kinds of alerts", async () => {
    const rows = (await as(boss).get("/alerts")).body.data as AlertRow[];
    const kpi = rows.find((row) => row.rule === "KPI_BEHIND")!;
    expect(kpi).not.toHaveProperty("tasks");
  });
});
