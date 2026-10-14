/** Personal tasks: hidden from the board, seen by their people, their heads and directors. */
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let boss: TestUser, natalia: TestUser, tymoshenko: TestUser, trubylo: TestUser, semenets: TestUser, ponomarenko: TestUser;
let salesBoard: string, diyBoard: string;

const as = (who: TestUser) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`),
  post: (path: string, body: object) => request(app).post(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body),
  patch: (path: string, body: object) => request(app).patch(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body)
});
const boardOf = async (departmentId: string | null) => (await harness.query<{ id: string }>("SELECT id FROM task_boards WHERE department_id = $1", [departmentId])).rows[0]!.id;
const create = async (who: TestUser, body: object) => {
  const response = await as(who).post("/tasks", body);
  expect(response.status).toBe(201);
  return response.body.data as { id: string; onBoard: boolean };
};
const listed = async (who: TestUser, query: string) => ((await as(who).get(`/tasks?limit=100&${query}`)).body.data as Array<{ id: string }>).map((task) => task.id);
const taskTotal = async (who: TestUser) => (await as(who).get("/dashboard")).body.data.metrics.tasks.total as number;

beforeAll(async () => {
  harness = await startDbHarness();
  const { memoryPresenceStore, setPresenceStore } = await import("../presence");
  setPresenceStore(memoryPresenceStore());
  app = (await import("../app")).app;
  boss = await harness.user("nikonov", "DIRECTOR", "Руководство", { consent: true });
  natalia = await harness.user("denysiuk", "MANAGER", "Департамент продаж", { consent: true });
  tymoshenko = await harness.user("tymoshenko", "EMPLOYEE", "Отдел продаж", { consent: true });
  trubylo = await harness.user("trubylo", "EMPLOYEE", "Отдел продаж", { consent: true });
  semenets = await harness.user("semenets", "MANAGER", "Отдел DIY", { consent: true });
  ponomarenko = await harness.user("ponomarenko.r", "MANAGER", "Маркетинг", { consent: true });
  await harness.query("UPDATE departments SET parent_id = $1 WHERE id = ANY($2::uuid[])", [natalia.departmentId, [tymoshenko.departmentId, semenets.departmentId]]);
  salesBoard = await boardOf(tymoshenko.departmentId);
  diyBoard = await boardOf(semenets.departmentId);
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("personal tasks", () => {
  it("keeps a head's task for herself off the board, hidden from her managers", async () => {
    const own = await create(natalia, { boardId: salesBoard, title: "Звіт для директора", assigneeIds: [natalia.id] });
    expect(own.onBoard).toBe(false);
    expect((await as(tymoshenko).get(`/tasks/${own.id}`)).status).toBe(404);
    expect(await listed(tymoshenko, `boardId=${salesBoard}`)).not.toContain(own.id);
    expect(await listed(natalia, "assignee=me")).toContain(own.id);
    expect((await as(boss).get(`/tasks/${own.id}`)).status).toBe(200);
  });

  it("shares a task the head assigns to a manager, and keeps existing tasks shared", async () => {
    const shared = await create(natalia, { boardId: salesBoard, title: "Обдзвонити дилерів", assigneeIds: [tymoshenko.id] });
    expect(shared.onBoard).toBe(true);
    expect((await as(trubylo).get(`/tasks/${shared.id}`)).status).toBe(200);
    const stage = (await harness.query<{ id: string }>("SELECT id FROM task_board_stages WHERE board_id = $1 ORDER BY sort_order LIMIT 1", [salesBoard])).rows[0]!.id;
    const legacy = (await harness.query<{ id: string }>(
      "INSERT INTO tasks (company_id, department_id, board_id, stage_id, created_by, title) VALUES ($1, $2, $3, $4, $5, 'Стара задача') RETURNING id",
      [harness.company, tymoshenko.departmentId, salesBoard, stage, natalia.id])).rows[0]!.id;
    expect(await listed(trubylo, `boardId=${salesBoard}`)).toContain(legacy);
  });

  it("lets the parent head and the director see a manager's personal task, and nobody else", async () => {
    const mine = await create(tymoshenko, { boardId: salesBoard, title: "Підготувати КП" });
    expect(mine.onBoard).toBe(false);
    expect((await as(natalia).get(`/tasks/${mine.id}`)).status).toBe(200);
    expect((await as(boss).get(`/tasks/${mine.id}`)).status).toBe(200);
    expect((await as(trubylo).get(`/tasks/${mine.id}`)).status).toBe(404);
    expect((await as(semenets).get(`/tasks/${mine.id}`)).status).toBe(404);
    expect((await as(ponomarenko).get(`/tasks/${mine.id}`)).status).toBe(404);
    expect(await listed(natalia, `boardId=${salesBoard}&visibility=personal`)).toContain(mine.id);
    expect(await listed(natalia, `boardId=${salesBoard}&visibility=board`)).not.toContain(mine.id);
  });

  it("doesn't count a personal task in the dashboard of a head who doesn't oversee it", async () => {
    const before = await taskTotal(semenets);
    await create(natalia, { boardId: diyBoard, title: "Перевірити стенди", assigneeIds: [natalia.id] });
    expect(await taskTotal(semenets)).toBe(before);
    await create(natalia, { boardId: diyBoard, title: "Спільна перевірка", assigneeIds: [semenets.id] });
    expect(await taskTotal(semenets)).toBe(before + 1);
  });

  it("shares a task when a colleague is added, never hides it implicitly, and honours an explicit choice", async () => {
    const task = await create(tymoshenko, { boardId: salesBoard, title: "Нагадування" });
    const withDirector = await as(tymoshenko).patch(`/tasks/${task.id}`, { assigneeIds: [tymoshenko.id, boss.id] });
    expect(withDirector.body.data.onBoard).toBe(false);
    const withColleague = await as(tymoshenko).patch(`/tasks/${task.id}`, { assigneeIds: [tymoshenko.id, boss.id, trubylo.id] });
    expect(withColleague.body.data.onBoard).toBe(true);
    const narrowed = await as(tymoshenko).patch(`/tasks/${task.id}`, { assigneeIds: [tymoshenko.id] });
    expect(narrowed.body.data.onBoard).toBe(true);
    const hidden = await as(tymoshenko).patch(`/tasks/${task.id}`, { onBoard: false });
    expect(hidden.body.data.onBoard).toBe(false);
    const kept = await create(natalia, { boardId: salesBoard, title: "Тільки нам двом", assigneeIds: [tymoshenko.id], onBoard: false });
    expect(kept.onBoard).toBe(false);
    expect((await as(trubylo).get(`/tasks/${kept.id}`)).status).toBe(404);
    expect((await as(tymoshenko).get(`/tasks/${kept.id}`)).status).toBe(200);
  });

  it("refuses an assignee from outside the board the switch", async () => {
    const task = await create(natalia, { boardId: salesBoard, title: "Банер для дилерів", assigneeIds: [ponomarenko.id] });
    const refused = await as(ponomarenko).patch(`/tasks/${task.id}`, { onBoard: false });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("TASK_OUTSIDER_FORBIDDEN");
  });
});
