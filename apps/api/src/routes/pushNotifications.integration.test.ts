/** Desktop notifications: subscriptions, group preferences and dropping dead subscriptions, with a stubbed push service. */
import webPush from "web-push";
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const keys = webPush.generateVAPIDKeys();
Object.assign(process.env, { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: "mailto:admin@rdim.ua" });

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let head: TestUser, seller: TestUser, colleague: TestUser;
let board: string;
const pushed: Array<{ endpoint: string; payload: { title: string; body: string; link: string } }> = [];
const status = new Map<string, number>();

const as = (who: TestUser) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`),
  post: (path: string, body: object = {}) => request(app).post(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body),
  patch: (path: string, body: object) => request(app).patch(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body),
  delete: (path: string, body: object) => request(app).delete(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body)
});
const subscription = (name: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${name}`, keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } });
const subscriptions = async (userId: string) => (await harness.query<{ endpoint: string; failures: number }>("SELECT endpoint, failures FROM push_subscriptions WHERE user_id = $1", [userId])).rows;

beforeAll(async () => {
  harness = await startDbHarness();
  const { memoryPresenceStore, setPresenceStore } = await import("../presence");
  setPresenceStore(memoryPresenceStore());
  app = (await import("../app")).app;
  (await import("../notifications/push")).setPushSender(async (target, payload) => {
    pushed.push({ endpoint: target.endpoint, payload: JSON.parse(payload) });
    return status.get(target.endpoint) ?? 201;
  });
  head = await harness.user("denysiuk", "MANAGER", "Отдел продаж", { consent: true });
  seller = await harness.user("tymoshenko", "EMPLOYEE", "Отдел продаж", { consent: true });
  colleague = await harness.user("trubylo", "EMPLOYEE", "Отдел продаж", { consent: true });
  board = (await harness.query<{ id: string }>("SELECT id FROM task_boards WHERE department_id = $1", [head.departmentId])).rows[0]!.id;
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("desktop notifications", () => {
  it("gives the public key and stores a browser's subscription, audited with its id only", async () => {
    expect((await as(seller).get("/notifications/push/config")).body.data).toEqual({ enabled: true, publicKey: keys.publicKey });
    const saved = await as(seller).post("/notifications/push/subscriptions", subscription("seller-chrome"));
    expect(saved.status).toBe(201);
    const audit = await harness.query<{ entity_id: string; metadata: object }>("SELECT entity_id, metadata FROM audit_logs WHERE action = 'PUSH_SUBSCRIBED'");
    expect(audit.rows).toEqual([{ entity_id: saved.body.data.id, metadata: {} }]);
    expect((await as(seller).post("/notifications/push/subscriptions", { endpoint: "http://insecure.test/x", keys: subscription("x").keys })).status).toBe(400);
  });

  it("pushes a task assigned to them with a title, a short preview and a link", async () => {
    const task = (await as(head).post("/tasks", { boardId: board, title: "Відвантажити Нексанс", assigneeIds: [seller.id] })).body.data;
    await vi.waitFor(() => expect(pushed.some((item) => item.payload.link === `/tasks?task=${task.id}`)).toBe(true));
    const sent = pushed.find((item) => item.payload.link === `/tasks?task=${task.id}`)!;
    expect(sent).toMatchObject({ endpoint: subscription("seller-chrome").endpoint, payload: { title: "Новая задача: Відвантажити Нексанс" } });
    expect(sent.payload.body.length).toBeLessThanOrEqual(120);
  });

  it("respects a turned-off group: the bell gets it, the desktop doesn't", async () => {
    expect((await as(seller).patch("/notifications/preferences", { chat: false })).body.data).toEqual({ tasks: true, chat: false, telegram: true, alerts: true });
    pushed.length = 0;
    const dm = (await as(colleague).post("/chat/direct", { userId: seller.id })).body.data;
    await as(colleague).post(`/chat/conversations/${dm.id}/messages`, { body: "Привіт" });
    expect((await as(seller).get("/notifications")).body.data[0].kind).toBe("CHAT_DIRECT");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(pushed).toEqual([]);
  });

  it("deletes a subscription the push service reports gone, and one that keeps failing", async () => {
    await as(colleague).post("/notifications/push/subscriptions", subscription("colleague-gone"));
    await as(colleague).post("/notifications/push/subscriptions", subscription("colleague-flaky"));
    status.set(subscription("colleague-gone").endpoint, 410);
    status.set(subscription("colleague-flaky").endpoint, 500);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await as(colleague).post("/notifications/push/test");
    }
    expect(await subscriptions(colleague.id)).toEqual([]);
  });

  it("removes a browser on request and sends a test to the remaining ones", async () => {
    await as(seller).post("/notifications/push/subscriptions", subscription("seller-laptop"));
    expect((await as(seller).post("/notifications/push/test")).body.data).toEqual({ browsers: 2, delivered: 2 });
    expect((await as(seller).delete("/notifications/push/subscriptions", { endpoint: subscription("seller-laptop").endpoint })).status).toBe(204);
    expect((await subscriptions(seller.id)).map((row) => row.endpoint)).toEqual([subscription("seller-chrome").endpoint]);
    // Another user can't remove someone else's browser.
    await as(colleague).delete("/notifications/push/subscriptions", { endpoint: subscription("seller-chrome").endpoint });
    expect(await subscriptions(seller.id)).toHaveLength(1);
  });
});
