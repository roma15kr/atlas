/** Notifications: each person sees only their own, created for the people an event concerns. */
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let natalia: TestUser, tymoshenko: TestUser, trubylo: TestUser;
let salesBoard: string;

const as = (who: TestUser) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`),
  post: (path: string, body: object = {}) => request(app).post(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body),
  patch: (path: string, body: object) => request(app).patch(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body)
});
const inbox = async (who: TestUser) => (await as(who).get("/notifications")).body as { data: Array<{ id: string; kind: string; title: string; body: string; link: string; readAt: string | null }>; meta: { unreadCount: number } };

beforeAll(async () => {
  harness = await startDbHarness();
  const { memoryPresenceStore, setPresenceStore } = await import("../presence");
  setPresenceStore(memoryPresenceStore());
  app = (await import("../app")).app;
  natalia = await harness.user("denysiuk", "MANAGER", "Отдел продаж", { consent: true });
  tymoshenko = await harness.user("tymoshenko", "EMPLOYEE", "Отдел продаж", { consent: true });
  trubylo = await harness.user("trubylo", "EMPLOYEE", "Отдел продаж", { consent: true });
  salesBoard = (await harness.query<{ id: string }>("SELECT id FROM task_boards WHERE department_id = $1", [natalia.departmentId])).rows[0]!.id;
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("notification centre", () => {
  it("notifies a new assignee, not the head who assigned the task", async () => {
    const task = (await as(natalia).post("/tasks", { boardId: salesBoard, title: "Обдзвонити дилерів", assigneeIds: [tymoshenko.id] })).body.data;
    const mine = await inbox(tymoshenko);
    expect(mine.meta.unreadCount).toBe(1);
    expect(mine.data[0]).toMatchObject({ kind: "TASK_ASSIGNED", title: "Новая задача: Обдзвонити дилерів", link: `/tasks?task=${task.id}`, readAt: null });
    const author = (await harness.query<{ full_name: string }>("SELECT full_name FROM users WHERE id = $1", [natalia.id])).rows[0]!.full_name;
    expect(mine.data[0]!.body).toBe(`${author} · Задачи отдела`);
    expect((await inbox(natalia)).meta.unreadCount).toBe(0);

    // Adding a colleague later notifies only the newcomer.
    await as(natalia).patch(`/tasks/${task.id}`, { assigneeIds: [tymoshenko.id, trubylo.id] });
    expect((await inbox(trubylo)).meta.unreadCount).toBe(1);
    expect((await inbox(tymoshenko)).meta.unreadCount).toBe(1);
  });

  it("keeps notifications private and marks them read", async () => {
    const [notification] = (await inbox(tymoshenko)).data;
    const foreign = await as(trubylo).post(`/notifications/${notification!.id}/read`);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("NOTIFICATION_NOT_FOUND");
    expect((await inbox(tymoshenko)).meta.unreadCount).toBe(1);

    const read = await as(tymoshenko).post(`/notifications/${notification!.id}/read`);
    expect(read.body.data.readAt).not.toBeNull();
    expect((await inbox(tymoshenko)).meta.unreadCount).toBe(0);

    await as(natalia).post("/tasks", { boardId: salesBoard, title: "Ще одна", assigneeIds: [trubylo.id] });
    expect((await inbox(trubylo)).meta.unreadCount).toBe(2);
    expect((await as(trubylo).post("/notifications/read-all")).body.data.unreadCount).toBe(0);
    expect((await inbox(trubylo)).meta.unreadCount).toBe(0);
  });
});
