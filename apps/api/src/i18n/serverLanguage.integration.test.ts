/** Server texts follow each reader's interface language: notifications per recipient, alerts per reader, AI per requester. */
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, text } from ".";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let head: TestUser, oksana: TestUser, john: TestUser, ivan: TestUser, boss: TestUser;
let board: string;

const as = (who: TestUser) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`),
  post: (path: string, body: object = {}) => request(app).post(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body)
});
const latest = async (who: TestUser) => ((await as(who).get("/notifications")).body.data as Array<{ kind: string; title: string; body: string | null }>)[0];
const speaks = (who: TestUser, language: string) => harness.query("UPDATE users SET language = $2 WHERE id = $1", [who.id, language]);

beforeAll(async () => {
  harness = await startDbHarness();
  const { memoryPresenceStore, setPresenceStore } = await import("../presence");
  setPresenceStore(memoryPresenceStore());
  app = (await import("../app")).app;
  head = await harness.user("denysiuk", "MANAGER", "Отдел продаж", { consent: true });
  oksana = await harness.user("oksana", "EMPLOYEE", "Отдел продаж", { consent: true });
  john = await harness.user("john", "EMPLOYEE", "Отдел продаж", { consent: true });
  ivan = await harness.user("ivan", "EMPLOYEE", "Отдел продаж", { consent: true });
  boss = await harness.user("nikonov", "DIRECTOR", "Руководство", { consent: true });
  await speaks(john, "en");
  await speaks(ivan, "ru");
  board = (await harness.query<{ id: string }>("SELECT id FROM task_boards WHERE department_id = $1", [head.departmentId])).rows[0]!.id;
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("notifications in the recipient's language", () => {
  it("tells a Ukrainian, an English and a Russian colleague about one task, each in their language", async () => {
    await as(head).post("/tasks", { boardId: board, title: "Звіт для Nexans", assigneeIds: [oksana.id, john.id, ivan.id] });
    expect(await latest(oksana)).toMatchObject({ kind: "TASK_ASSIGNED", title: "Нова задача: Звіт для Nexans" });
    expect(await latest(john)).toMatchObject({ kind: "TASK_ASSIGNED", title: "New task: Звіт для Nexans" });
    expect(await latest(ivan)).toMatchObject({ kind: "TASK_ASSIGNED", title: "Новая задача: Звіт для Nexans" });
  });

  it("names the channel of a new message in each member's language, keeping the author's words as written", async () => {
    const channel = (await as(head).post("/chat/channels", { name: "Продажі", visibility: "PUBLIC", memberIds: [oksana.id, john.id] })).body.data.id as string;
    await as(head).post(`/chat/conversations/${channel}/messages`, { body: "Прайс оновлено" });
    expect(await latest(oksana)).toMatchObject({ kind: "CHAT_MESSAGE", title: "Нове в #Продажі" });
    const english = await latest(john);
    expect(english).toMatchObject({ kind: "CHAT_MESSAGE", title: "New in #Продажі" });
    expect(english!.body).toMatch(/: Прайс оновлено$/);
  });

  it("sends the morning due reminder in each assignee's language", async () => {
    const task = (await as(head).post("/tasks", { boardId: board, title: "Дзвінок", assigneeIds: [oksana.id, john.id] })).body.data;
    await harness.query("UPDATE tasks SET due_at = '2026-11-02T15:00:00Z' WHERE id = $1", [task.id]);
    const { runTaskReminders } = await import("../automation/taskReminders");
    await runTaskReminders(new Date("2026-11-02T08:00:00Z"));
    expect(await latest(oksana)).toMatchObject({ kind: "TASK_DUE", title: "Термін сьогодні: Дзвінок", body: "Задачу потрібно закінчити сьогодні" });
    expect(await latest(john)).toMatchObject({ kind: "TASK_DUE", title: "Due today: Дзвінок", body: "The task must be finished today" });
  });
});

describe("alerts in the reader's language", () => {
  it("renders a rule's alert for each reader and keeps the stored text of an unknown rule", async () => {
    const company = (await harness.query<{ company_id: string }>("SELECT company_id FROM users WHERE id = $1", [oksana.id])).rows[0]!.company_id;
    await harness.query(
      `INSERT INTO alerts (company_id, department_id, user_id, severity, category, title, summary, evidence, rule, dedupe_key)
       VALUES ($1, $2, $3, 'WARNING', 'DEADLINES', 'Просроченные задачи', 'stored', '{"overdue": 4, "taskIds": []}', 'TASKS_OVERDUE', 'test:overdue'),
              ($1, $2, $3, 'INFO', 'OTHER', 'Старое наблюдение', 'Сохранённый текст', '{}', 'legacy-rule', 'test:legacy')`,
      [company, oksana.departmentId, oksana.id]);
    const name = (await harness.query<{ full_name: string }>("SELECT full_name FROM users WHERE id = $1", [oksana.id])).rows[0]!.full_name;
    const read = async (who: TestUser) => ((await as(who).get("/alerts")).body.data as Array<{ rule: string; title: string; summary: string }>);
    await speaks(boss, "en");
    const english = await read(boss);
    expect(english.find((row) => row.rule === "TASKS_OVERDUE")).toMatchObject({ title: "Overdue tasks", summary: `${name}: 4 overdue tasks` });
    expect(english.find((row) => row.rule === "legacy-rule")).toMatchObject({ title: "Старое наблюдение", summary: "Сохранённый текст" });
    const ukrainian = await read(head);
    expect(ukrainian.find((row) => row.rule === "TASKS_OVERDUE")).toMatchObject({ title: "Прострочені задачі", summary: `${name}: прострочено задач — 4` });
  });
});

describe("templates", () => {
  it("renders nested texts and leaves an unknown placeholder visible", () => {
    expect(render("en", text("chat.mentionIn", { author: text("common.colleague"), place: text("chat.channel") }))).toBe("A colleague mentioned you in channel");
    expect(render("uk", text("task.assigned"))).toBe("Нова задача: {title}");
    expect(render("ru", "Свой текст")).toBe("Свой текст");
  });

  it("keeps the same placeholders in every language", async () => {
    const [{ uk }, { ru }, { en }] = await Promise.all([import("./uk"), import("./ru"), import("./en")]);
    const names = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join();
    for (const key of Object.keys(uk) as Array<keyof typeof uk>) {
      expect(names(ru[key]), key).toBe(names(uk[key]));
      expect(names(en[key]), key).toBe(names(uk[key]));
    }
  });
});
