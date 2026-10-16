/** Notifications: each person sees only their own, created for the people an event concerns. */
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let natalia: TestUser, tymoshenko: TestUser, trubylo: TestUser, babenko: TestUser, boss: TestUser, olga: TestUser;
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
  babenko = await harness.user("babenko", "EMPLOYEE", "Отдел продаж", { consent: true });
  boss = await harness.user("nikonov", "DIRECTOR", "Руководство", { consent: true });
  olga = await harness.user("olga", "MANAGER", "Склад", { consent: true });
  salesBoard = (await harness.query<{ id: string }>("SELECT id FROM task_boards WHERE department_id = $1", [natalia.departmentId])).rows[0]!.id;
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("notification centre", () => {
  it("reports desktop notifications as unavailable without server keys", async () => {
    expect((await as(tymoshenko).get("/notifications/push/config")).body.data).toEqual({ enabled: false, publicKey: null });
    expect((await as(tymoshenko).post("/notifications/push/subscriptions", { endpoint: "https://push.test/x", keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } })).body.error.code).toBe("PUSH_DISABLED");
  });

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

  it("notifies a direct message once per burst, respects muting, and still notifies a mention", async () => {
    await as(trubylo).post("/notifications/read-all");
    const dm = (await as(tymoshenko).post("/chat/direct", { userId: trubylo.id })).body.data;
    await as(tymoshenko).post(`/chat/conversations/${dm.id}/messages`, { body: "Привіт" });
    await as(tymoshenko).post(`/chat/conversations/${dm.id}/messages`, { body: "Глянь **рахунок**" });
    const burst = await inbox(trubylo);
    expect(burst.meta.unreadCount).toBe(1);
    expect(burst.data[0]).toMatchObject({ kind: "CHAT_DIRECT", body: "Глянь рахунок", link: `/messages?conversation=${dm.id}` });

    await as(trubylo).post("/notifications/read-all");
    await as(trubylo).patch(`/chat/conversations/${dm.id}/mute`, { muted: true });
    await as(tymoshenko).post(`/chat/conversations/${dm.id}/messages`, { body: "Ще одне" });
    expect((await inbox(trubylo)).meta.unreadCount).toBe(0);
    await as(tymoshenko).post(`/chat/conversations/${dm.id}/messages`, { body: "@trubylo терміново" });
    expect((await inbox(trubylo)).data[0]).toMatchObject({ kind: "CHAT_MENTION", readAt: null });
  });

  it("doesn't notify someone mentioned in a group they are not in", async () => {
    await as(trubylo).post("/notifications/read-all");
    const group = (await as(natalia).post("/chat/groups", { name: "Керівництво", userIds: [tymoshenko.id, babenko.id] })).body.data;
    await as(natalia).post(`/chat/conversations/${group.id}/messages`, { body: "@trubylo не бачить цього" });
    expect((await inbox(trubylo)).meta.unreadCount).toBe(0);
  });

  it("notifies the other members of a group conversation", async () => {
    await as(tymoshenko).post("/notifications/read-all");
    const group = (await as(natalia).post("/chat/groups", { name: "Звіти", userIds: [tymoshenko.id, trubylo.id] })).body.data;
    await as(natalia).post(`/chat/conversations/${group.id}/messages`, { body: "Звіт до п'ятниці" });
    const mine = await inbox(tymoshenko);
    expect(mine.meta.unreadCount).toBe(1);
    expect(mine.data[0]).toMatchObject({ kind: "CHAT_MESSAGE", title: "Новое в «Звіти»", link: `/messages?conversation=${group.id}` });
    expect((await inbox(natalia)).data.some((item) => item.kind === "CHAT_MESSAGE")).toBe(false);
  });

  it("notifies channel members once per channel while unread, skipping the muted, outsiders and the mentioned", async () => {
    for (const who of [natalia, tymoshenko, trubylo, babenko, olga]) await as(who).post("/notifications/read-all");
    const channel = (await as(natalia).post("/chat/channels", { name: "Продажі-новини", visibility: "PUBLIC", memberIds: [tymoshenko.id, trubylo.id, babenko.id] })).body.data;
    await as(babenko).patch(`/chat/conversations/${channel.id}/mute`, { muted: true });
    await as(natalia).post(`/chat/conversations/${channel.id}/messages`, { body: "План на тиждень" });
    await as(natalia).post(`/chat/conversations/${channel.id}/messages`, { body: "Оновлений **прайс**" });

    const seller = await inbox(tymoshenko);
    expect(seller.meta.unreadCount).toBe(1);
    const author = (await harness.query<{ full_name: string }>("SELECT full_name FROM users WHERE id = $1", [natalia.id])).rows[0]!.full_name;
    expect(seller.data[0]).toMatchObject({ kind: "CHAT_MESSAGE", title: "Новое в #Продажі-новини", body: `${author}: Оновлений прайс` });
    expect((await inbox(babenko)).meta.unreadCount).toBe(0);
    expect((await inbox(olga)).meta.unreadCount).toBe(0);

    // A muted member still gets a mention, and only the mention.
    await as(natalia).post(`/chat/conversations/${channel.id}/messages`, { body: "@babenko глянь" });
    expect((await inbox(babenko)).data.filter((item) => !item.readAt).map((item) => item.kind)).toEqual(["CHAT_MENTION"]);
  });

  it("notifies only the people of a thread about a reply in a channel", async () => {
    const channel = (await as(natalia).post("/chat/channels", { name: "Склад-питання", visibility: "PUBLIC", memberIds: [tymoshenko.id, trubylo.id, babenko.id] })).body.data;
    const root = (await as(tymoshenko).post(`/chat/conversations/${channel.id}/messages`, { body: "Коли відвантаження?" })).body.data.id;
    for (const who of [natalia, tymoshenko, trubylo, babenko]) await as(who).post("/notifications/read-all");
    await as(trubylo).post(`/chat/conversations/${channel.id}/messages`, { body: "Завтра", parentId: root });
    expect((await inbox(tymoshenko)).data[0]).toMatchObject({ kind: "CHAT_MESSAGE", readAt: null });
    expect((await inbox(natalia)).meta.unreadCount).toBe(0);
    expect((await inbox(babenko)).meta.unreadCount).toBe(0);
    await as(babenko).post(`/chat/conversations/${channel.id}/messages`, { body: "Дякую", parentId: root });
    expect((await inbox(trubylo)).meta.unreadCount).toBe(1);
  });

  it("notifies the responsible person about a customer's Telegram messages, collapsed per customer", async () => {
    const { handleUpdate } = await import("../telegram/handleUpdate");
    await as(tymoshenko).post("/notifications/read-all");
    await as(trubylo).post("/notifications/read-all");
    const contact = (await harness.query<{ id: string }>(
      "INSERT INTO telegram_contacts (company_id, telegram_user_id, first_name, responsible_id) VALUES ($1, 7001, 'Сергій', $2) RETURNING id",
      [harness.company, tymoshenko.id])).rows[0]!.id;
    const message = (id: number, text: string) => ({ update_id: id, message: { message_id: id, date: Math.floor(Date.now() / 1000), chat: { id: 7001, type: "private" }, from: { id: 7001, first_name: "Сергій" }, text } });
    await handleUpdate(harness.company, message(1, "Добрий день"));
    await handleUpdate(harness.company, message(2, "Коли доставка?"));
    const mine = await inbox(tymoshenko);
    expect(mine.meta.unreadCount).toBe(1);
    expect(mine.data[0]).toMatchObject({ kind: "TELEGRAM_MESSAGE", title: "Telegram: Сергій", body: "Коли доставка?", link: `/telegram?contact=${contact}` });
    expect((await inbox(trubylo)).meta.unreadCount).toBe(0);
  });

  it("notifies exactly the people who can see a new alert", async () => {
    const { notifyAlert } = await import("../automation/alerts");
    for (const who of [tymoshenko, trubylo, natalia, boss, olga]) await as(who).post("/notifications/read-all");
    const alert = (await harness.query<{ id: string }>(
      "INSERT INTO alerts (company_id, department_id, user_id, severity, category, title, summary, rule) VALUES ($1, $2, $3, 'WARNING', 'TASK', 'Просрочені задачі', '3 задачі прострочені', 'test-rule') RETURNING id",
      [harness.company, tymoshenko.departmentId, tymoshenko.id])).rows[0]!.id;
    await notifyAlert(alert);
    const got = async (who: TestUser) => (await inbox(who)).data.some((item) => item.kind === "ALERT_CREATED" && !item.readAt);
    expect({ tymoshenko: await got(tymoshenko), natalia: await got(natalia), boss: await got(boss), trubylo: await got(trubylo), olga: await got(olga) })
      .toEqual({ tymoshenko: true, natalia: true, boss: true, trubylo: false, olga: false });
  });

  it("tells the new owner about a deal or client handed over, not about their own", async () => {
    for (const who of [tymoshenko, trubylo]) await as(who).post("/notifications/read-all");
    const funnel = (await harness.query<{ id: string }>("INSERT INTO deal_funnels (company_id, name) VALUES ($1, 'Основна') RETURNING id", [harness.company])).rows[0]!.id;
    await harness.query("INSERT INTO deal_stages (company_id, funnel_id, name, color, sort_order, outcome) VALUES ($1, $2, 'Кваліфікація', '#2563EB', 10, 'OPEN')", [harness.company, funnel]);
    const client = (await as(natalia).post("/clients", { name: "Нексанс", ownerId: tymoshenko.id })).body.data;
    expect((await inbox(tymoshenko)).data[0]).toMatchObject({ kind: "CLIENT_ASSIGNED", link: `/crm/${client.id}` });
    const deal = (await as(natalia).post("/deals", { clientId: client.id, funnelId: funnel, title: "Кабель 2026", ownerId: tymoshenko.id })).body.data;
    expect((await inbox(tymoshenko)).data[0]).toMatchObject({ kind: "DEAL_ASSIGNED", title: "Вам передана сделка: Кабель 2026", link: `/sales?deal=${deal.id}` });

    await as(natalia).patch(`/clients/${client.id}`, { ownerId: trubylo.id });
    expect((await inbox(trubylo)).data[0]).toMatchObject({ kind: "CLIENT_ASSIGNED", readAt: null });

    await as(tymoshenko).post("/notifications/read-all");
    const own = (await as(tymoshenko).post("/clients", { name: "Свій клієнт" })).body.data;
    expect((await as(tymoshenko).post("/deals", { clientId: own.id, funnelId: funnel, title: "Своя угода" })).status).toBe(201);
    expect((await inbox(tymoshenko)).meta.unreadCount).toBe(0);
  });
});
