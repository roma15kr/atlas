/** Task comments end to end through the Express app and the real migrations (PGlite). */
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let anna: TestUser, head: TestUser, olga: TestUser;
let taskId: string;

const as = (who: TestUser) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`),
  post: (path: string, body: object) => request(app).post(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body),
  delete: (path: string) => request(app).delete(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`)
});

beforeAll(async () => {
  harness = await startDbHarness();
  app = (await import("../app")).app;
  anna = await harness.user("anna", "EMPLOYEE", "Sales", { consent: true });
  head = await harness.user("head", "MANAGER", "Sales", { consent: true });
  olga = await harness.user("olga", "EMPLOYEE", "Ops", { consent: true });
  // Every department gets its own task board with default stages.
  const board = (await harness.query<{ id: string }>("SELECT id FROM task_boards WHERE department_id = $1", [anna.departmentId])).rows[0]!.id;
  const created = await as(anna).post("/tasks", { boardId: board, title: "КП для «Олді»" });
  expect(created.status).toBe(201);
  taskId = created.body.data.id;
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("task comments", () => {
  it("lets board members add and read comments, oldest first, with the author", async () => {
    const first = await as(anna).post(`/tasks/${taskId}/comments`, { body: "КП отправлено, **ждём ответа**" });
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ body: "КП отправлено, **ждём ответа**", author: { id: anna.id, fullName: "anna" } });
    expect((await as(head).post(`/tasks/${taskId}/comments`, { body: "Скидку не больше 5%" })).status).toBe(201);
    const list = await as(head).get(`/tasks/${taskId}/comments`);
    expect(list.status).toBe(200);
    expect(list.body.data.map((comment: { body: string }) => comment.body)).toEqual(["КП отправлено, **ждём ответа**", "Скидку не больше 5%"]);
  });

  it("answers 404 TASK_NOT_FOUND to someone who cannot open the board and stores nothing", async () => {
    const read = await as(olga).get(`/tasks/${taskId}/comments`);
    expect(read.status).toBe(404);
    expect(read.body.error.code).toBe("TASK_NOT_FOUND");
    const write = await as(olga).post(`/tasks/${taskId}/comments`, { body: "Чужой комментарий" });
    expect(write.status).toBe(404);
    const stored = await harness.query("SELECT 1 FROM task_comments WHERE author_id = $1", [olga.id]);
    expect(stored.rows).toHaveLength(0);
  });

  it("rejects an empty or too long comment", async () => {
    expect((await as(anna).post(`/tasks/${taskId}/comments`, { body: "   " })).status).toBe(400);
    expect((await as(anna).post(`/tasks/${taskId}/comments`, { body: "а".repeat(5001) })).status).toBe(400);
  });

  it("audits each comment with ids only, never the text", async () => {
    const events = await harness.query<{ entity_id: string; metadata: Record<string, unknown> }>(
      "SELECT entity_id, metadata FROM audit_logs WHERE action = 'TASK_COMMENT_CREATED' ORDER BY id");
    expect(events.rows).toHaveLength(2);
    expect(events.rows[0]!.entity_id).toBe(taskId);
    expect(Object.keys(events.rows[0]!.metadata)).toEqual(["commentId"]);
    expect(JSON.stringify(events.rows)).not.toContain("ждём");
  });

  it("deletes the comments with the task", async () => {
    expect((await as(anna).delete(`/tasks/${taskId}`)).status).toBe(204);
    const left = await harness.query("SELECT 1 FROM task_comments WHERE task_id = $1", [taskId]);
    expect(left.rows).toHaveLength(0);
  });
});
