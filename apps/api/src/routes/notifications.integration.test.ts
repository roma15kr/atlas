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

  it("tells the author and assignees about a comment, not the commenter", async () => {
    await as(trubylo).post("/notifications/read-all");
    await as(natalia).post("/notifications/read-all");
    const task = (await as(natalia).post("/tasks", { boardId: salesBoard, title: "Банер для дилерів", assigneeIds: [trubylo.id] })).body.data;
    await as(trubylo).post("/notifications/read-all");
    await as(trubylo).post(`/tasks/${task.id}/comments`, { body: "Макет **готовий**" });
    const head = await inbox(natalia);
    expect(head.meta.unreadCount).toBe(1);
    expect(head.data[0]).toMatchObject({ kind: "TASK_COMMENTED", body: "Макет готовий", link: `/tasks?task=${task.id}` });
    expect((await inbox(trubylo)).meta.unreadCount).toBe(0);
    expect((await inbox(tymoshenko)).data.some((item) => item.kind === "TASK_COMMENTED")).toBe(false);
  });

  it("reminds about due and overdue tasks once, after 08:00 Kyiv time, and again for a moved deadline", async () => {
    const { runTaskReminders } = await import("../automation/taskReminders");
    const today = (await as(natalia).post("/tasks", { boardId: salesBoard, title: "Відвантажити Нексанс", assigneeIds: [tymoshenko.id], dueAt: "2026-10-16T12:00:00.000Z" })).body.data;
    const late = (await as(natalia).post("/tasks", { boardId: salesBoard, title: "Рахунок Нанокабель", assigneeIds: [tymoshenko.id], dueAt: "2026-10-14T12:00:00.000Z" })).body.data;
    const doneStage = (await harness.query<{ id: string }>("SELECT id FROM task_board_stages WHERE board_id = $1 AND category = 'DONE' LIMIT 1", [salesBoard])).rows[0]!.id;
    await as(natalia).post("/tasks", { boardId: salesBoard, stageId: doneStage, title: "Вже зроблено", assigneeIds: [tymoshenko.id], dueAt: "2026-10-14T12:00:00.000Z" });
    await as(tymoshenko).post("/notifications/read-all");

    expect(await runTaskReminders(new Date("2026-10-16T04:30:00.000Z"))).toEqual({ due: 0, overdue: 0 }); // 07:30 in Kyiv
    expect(await runTaskReminders(new Date("2026-10-16T06:00:00.000Z"))).toEqual({ due: 1, overdue: 1 }); // 09:00
    expect(await runTaskReminders(new Date("2026-10-16T09:00:00.000Z"))).toEqual({ due: 0, overdue: 0 });
    const kinds = (await inbox(tymoshenko)).data.filter((item) => !item.readAt).map((item) => `${item.kind} ${item.link}`).sort();
    expect(kinds).toEqual([`TASK_DUE /tasks?task=${today.id}`, `TASK_OVERDUE /tasks?task=${late.id}`].sort());

    await as(natalia).patch(`/tasks/${late.id}`, { dueAt: "2026-10-15T12:00:00.000Z" });
    expect(await runTaskReminders(new Date("2026-10-16T10:00:00.000Z"))).toEqual({ due: 0, overdue: 1 });
  });

  it("deletes notifications older than 90 days", async () => {
    const { runTaskReminders } = await import("../automation/taskReminders");
    await harness.query("UPDATE notifications SET created_at = '2026-01-01' WHERE user_id = $1", [trubylo.id]);
    await runTaskReminders(new Date("2026-10-16T04:00:00.000Z"));
    expect((await inbox(trubylo)).data).toEqual([]);
  });
});
