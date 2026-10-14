/** Tasks assigned across departments: the assignee gets their own task, never the rest of the board. */
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let seller: TestUser, salesHead: TestUser, warehouse: TestUser, disabled: TestUser;
let salesBoard: string, sharedTask: string, privateTask: string;

const as = (who: TestUser) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`),
  post: (path: string, body: object) => request(app).post(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body),
  patch: (path: string, body: object) => request(app).patch(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body),
  delete: (path: string) => request(app).delete(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`)
});
const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id);

beforeAll(async () => {
  harness = await startDbHarness();
  app = (await import("../app")).app;
  seller = await harness.user("trubylo", "EMPLOYEE", "Отдел продаж", { consent: true });
  salesHead = await harness.user("denysiuk", "MANAGER", "Отдел продаж", { consent: true });
  warehouse = await harness.user("makarov", "EMPLOYEE", "Склад", { consent: true });
  disabled = await harness.user("left", "EMPLOYEE", "Склад", { consent: true });
  await harness.query("UPDATE users SET status = 'DISABLED' WHERE id = $1", [disabled.id]);
  salesBoard = (await harness.query<{ id: string }>("SELECT id FROM task_boards WHERE department_id = $1", [seller.departmentId])).rows[0]!.id;
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("tasks across departments", () => {
  it("lets a sales employee assign a warehouse colleague without making him a board member", async () => {
    const created = await as(seller).post("/tasks", { boardId: salesBoard, title: "Підготувати замовлення «Олді»", assigneeIds: [warehouse.id, seller.id] });
    expect(created.status).toBe(201);
    sharedTask = created.body.data.id;
    privateTask = (await as(seller).post("/tasks", { boardId: salesBoard, title: "Розрахунок знижки" })).body.data.id;
    const member = await harness.query("SELECT 1 FROM task_board_members WHERE board_id = $1 AND user_id = $2", [salesBoard, warehouse.id]);
    expect(member.rows).toHaveLength(0);
  });

  it("shows the warehouse colleague his task only, never the rest of the board", async () => {
    expect(ids((await as(warehouse).get("/tasks?assignee=me")).body.data)).toEqual([sharedTask]);
    expect(ids((await as(warehouse).get(`/tasks?boardId=${salesBoard}`)).body.data)).toEqual([sharedTask]);
    expect((await as(warehouse).get(`/tasks/${sharedTask}`)).status).toBe(200);
    const other = await as(warehouse).get(`/tasks/${privateTask}`);
    expect(other.status).toBe(404);
    expect(other.body.error.code).toBe("TASK_NOT_FOUND");
    expect((await as(warehouse).get(`/task-boards/${salesBoard}`)).status).toBe(404);
  });

  it("refuses assignees who are disabled or not in the company", async () => {
    const refused = await as(seller).post("/tasks", { boardId: salesBoard, title: "x", assigneeIds: [disabled.id] });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe("INVALID_ASSIGNEE");
    expect((await as(seller).post("/tasks", { boardId: salesBoard, title: "x", assigneeIds: ["99999999-9999-4999-8999-999999999999"] })).body.error.code).toBe("INVALID_ASSIGNEE");
  });

  it("lets him move his task between stages, edit and comment, but not change the board or assignees", async () => {
    const opened = (await as(warehouse).get(`/tasks/${sharedTask}`)).body.data;
    expect(opened.viaAssignment).toBe(true);
    const active = opened.boardStages.find((stage: { category: string }) => stage.category === "ACTIVE");
    expect(active).toBeTruthy();
    const moved = await as(warehouse).patch(`/tasks/${sharedTask}`, { stageId: active.id, dueAt: "2026-10-20T09:00:00.000Z" });
    expect(moved.status).toBe(200);
    expect(moved.body.data.stage.id).toBe(active.id);
    expect((await as(warehouse).post(`/tasks/${sharedTask}/comments`, { body: "Відвантажено" })).status).toBe(201);
    expect((await as(seller).get(`/tasks/${sharedTask}/comments`)).body.data.map((c: { body: string }) => c.body)).toEqual(["Відвантажено"]);
    expect((await as(seller).get(`/tasks/${sharedTask}`)).body.data.viaAssignment).toBe(false);

    const ownBoard = (await harness.query<{ id: string }>("SELECT id FROM task_boards WHERE department_id = $1", [warehouse.departmentId])).rows[0]!.id;
    const ownStage = (await harness.query<{ id: string }>("SELECT id FROM task_board_stages WHERE board_id = $1 LIMIT 1", [ownBoard])).rows[0]!.id;
    const toOtherBoard = await as(warehouse).patch(`/tasks/${sharedTask}`, { boardId: ownBoard, stageId: ownStage });
    expect(toOtherBoard.status).toBe(403);
    expect(toOtherBoard.body.error.code).toBe("TASK_OUTSIDER_FORBIDDEN");
    expect((await as(warehouse).patch(`/tasks/${sharedTask}`, { assigneeIds: [warehouse.id] })).status).toBe(403);
    const denied = await harness.query("SELECT 1 FROM audit_logs WHERE action = 'TASK_UPDATE_DENIED' AND entity_id = $1", [sharedTask]);
    expect(denied.rows).toHaveLength(2);
    expect((await as(warehouse).delete(`/tasks/${sharedTask}`)).status).toBe(403);
  });

  it("takes the task away once he is no longer an assignee", async () => {
    expect((await as(salesHead).patch(`/tasks/${sharedTask}`, { assigneeIds: [seller.id] })).status).toBe(200);
    expect((await as(warehouse).get(`/tasks/${sharedTask}`)).status).toBe(404);
    expect((await as(warehouse).get("/tasks?assignee=me")).body.data).toEqual([]);
  });
});

