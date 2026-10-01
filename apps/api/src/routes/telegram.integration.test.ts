/** Telegram inbox end to end through the Express app, real Postgres and a fake Bot API. */
import { vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, { TELEGRAM_BOT_TOKEN: "123456:test-token", TELEGRAM_WEBHOOK_SECRET: "s".repeat(40), TELEGRAM_MODE: "webhook", TELEGRAM_API_BASE: "https://bot.test" });
});

import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMailHarness } from "../test/mailHarness";
import type { AuthContext } from "../types";

const SECRET = "s".repeat(40);
const BLOCKED = 900, UNREACHABLE = 901;
let harness: Awaited<ReturnType<typeof startMailHarness>>;
let app: Express;
let tokens: Record<"anna" | "head" | "boss" | "alex" | "olga", string>;
let ids: Record<"company" | "client" | "otherClient" | "funnel" | "anna" | "alex" | "olga" | "head", string>;
const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
let nextMessageId = 1000;
let updateId = 1;

/** The fake Bot API: records calls and answers like Telegram, including blocked users and unknown chats. */
async function fakeTelegram(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const path = String(url).replace("https://bot.test", "");
  if (path.startsWith("/file/")) return new Response(Buffer.from("file-bytes"));
  const method = path.split("/").at(-1)!;
  const body = init?.body instanceof FormData ? Object.fromEntries([...init.body.entries()].map(([key, value]) => [key, typeof value === "string" ? value : "<file>"])) : JSON.parse(String(init?.body ?? "{}"));
  calls.push({ method, body });
  const chat = Number(body.chat_id);
  const json = (value: unknown) => new Response(JSON.stringify(value));
  if (chat === BLOCKED) return json({ ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" });
  if (chat === UNREACHABLE) return json({ ok: false, error_code: 400, description: "Bad Request: chat not found" });
  if (method === "getMe") return json({ ok: true, result: { id: 1, is_bot: true, username: "atlas_test_bot" } });
  if (method === "getFile") return json({ ok: true, result: { file_id: body.file_id, file_path: "photos/1.jpg" } });
  if (method === "getWebhookInfo") return json({ ok: true, result: { url: "https://x/api/telegram/webhook", pending_update_count: 0 } });
  if (method.startsWith("send")) return json({ ok: true, result: { message_id: nextMessageId++, date: 0, chat: { id: chat, type: "private" } } });
  return json({ ok: true, result: true });
}

const webhook = (update: object, secret = SECRET) => request(app).post("/api/telegram/webhook").set("X-Telegram-Bot-Api-Secret-Token", secret).send(update);
const message = (from: number, text: string, extra: object = {}) => ({
  update_id: updateId++, message: { message_id: updateId * 10, date: Math.floor(Date.now() / 1000), chat: { id: from, type: "private" }, from: { id: from, first_name: `User${from}` }, text, ...extra }
});
const as = (who: keyof typeof tokens) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${tokens[who]}`),
  post: (path: string, body?: object) => request(app).post(`/api/v1${path}`).set("Authorization", `Bearer ${tokens[who]}`).send(body ?? {}),
  patch: (path: string, body: object) => request(app).patch(`/api/v1${path}`).set("Authorization", `Bearer ${tokens[who]}`).send(body)
});
const contactOf = async (telegramId: number) => (await harness.query<{ id: string; client_id: string | null; responsible_id: string | null; status: string; greeted_at: Date | null }>(
  "SELECT id, client_id, responsible_id, status, greeted_at FROM telegram_contacts WHERE telegram_user_id = $1", [telegramId])).rows[0]!;
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
const audit = async (action: string) => (await harness.query<{ metadata: Record<string, unknown> }>("SELECT metadata FROM audit_logs WHERE action = $1", [action])).rows;

beforeAll(async () => {
  harness = await startMailHarness();
  (await import("../telegram/botApi")).setTelegramFetch(fakeTelegram as typeof fetch);
  const { query } = harness;
  const { signAccessToken } = await import("../auth");
  app = (await import("../app")).app;
  const company = (await query<{ id: string }>("INSERT INTO companies (name) VALUES ('Test') RETURNING id")).rows[0]!.id;
  const sales = (await query<{ id: string }>("INSERT INTO departments (company_id, name) VALUES ($1, 'Sales') RETURNING id", [company])).rows[0]!.id;
  const ops = (await query<{ id: string }>("INSERT INTO departments (company_id, name) VALUES ($1, 'Ops') RETURNING id", [company])).rows[0]!.id;
  const user = async (username: string, role: AuthContext["role"], department: string) => {
    const id = (await query<{ id: string }>("INSERT INTO users (company_id, department_id, username, password_hash, role, full_name) VALUES ($1, $2, $3, 'x', $4, $3) RETURNING id", [company, department, username, role])).rows[0]!.id;
    return { id, token: signAccessToken({ userId: id, companyId: company, departmentId: department, username, role }) };
  };
  const anna = await user("anna", "EMPLOYEE", sales), head = await user("head", "MANAGER", sales), boss = await user("boss", "DIRECTOR", sales);
  const alex = await user("alex", "EMPLOYEE", sales), olga = await user("olga", "EMPLOYEE", ops);
  tokens = { anna: anna.token, head: head.token, boss: boss.token, alex: alex.token, olga: olga.token };
  const client = (await query<{ id: string }>("INSERT INTO clients (company_id, department_id, owner_id, name, email, phone) VALUES ($1, $2, $3, 'Sofia', 'sofia@client.example', '+380 50 111 22 33') RETURNING id", [company, sales, anna.id])).rows[0]!.id;
  const otherClient = (await query<{ id: string }>("INSERT INTO clients (company_id, department_id, owner_id, name, email) VALUES ($1, $2, $3, 'Opsco', 'ops@client.example') RETURNING id", [company, ops, olga.id])).rows[0]!.id;
  const funnel = (await query<{ id: string }>("INSERT INTO deal_funnels (company_id, name) VALUES ($1, 'Основная') RETURNING id", [company])).rows[0]!.id;
  await query("INSERT INTO deal_stages (company_id, funnel_id, name, color, sort_order, outcome) VALUES ($1, $2, 'Новая', '#6B7280', 10, 'OPEN')", [company, funnel]);
  ids = { company, client, otherClient, funnel, anna: anna.id, alex: alex.id, olga: olga.id, head: head.id };
  const { checkConnection } = await import("../telegram/runner");
  await checkConnection();
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("Telegram inbox", () => {
  it("rejects a webhook call without the secret and stores nothing", async () => {
    expect((await webhook(message(100, "hi"), "wrong".repeat(8))).status).toBe(401);
    expect((await request(app).post("/api/telegram/webhook").send(message(100, "hi"))).status).toBe(401);
    expect((await harness.query("SELECT 1 FROM telegram_contacts")).rows).toHaveLength(0);
  });

  it("queues an unknown sender, greets once and stores each update once", async () => {
    const first = message(100, "Здравствуйте, сколько стоит доставка?");
    expect((await webhook(first)).status).toBe(200);
    expect((await webhook(first)).status).toBe(200);
    await settle();
    await webhook(message(100, "Алло?"));
    await settle();
    const contact = await contactOf(100);
    expect(contact.responsible_id).toBeNull();
    expect(calls.filter((call) => call.method === "sendMessage" && call.body.chat_id === 100)).toHaveLength(1);
    expect((await harness.query("SELECT 1 FROM telegram_messages WHERE contact_id = $1 AND direction = 'IN'", [contact.id])).rows).toHaveLength(2);
    expect((await as("head").get("/telegram/contacts?filter=unassigned")).body.data.map((item: { id: string }) => item.id)).toContain(contact.id);
    expect((await as("anna").get("/telegram/contacts")).body.data).toEqual([]);
    expect((await as("anna").get(`/telegram/contacts/${contact.id}`)).status).toBe(404);
  });

  it("lets a head triage within their department only", async () => {
    const contact = await contactOf(100);
    expect((await as("head").patch(`/telegram/contacts/${contact.id}`, { responsibleId: ids.olga })).status).toBe(403);
    expect((await audit("TELEGRAM_CONTACT_REASSIGNED_DENIED"))).toHaveLength(1);
    const response = await as("head").patch(`/telegram/contacts/${contact.id}`, { clientId: ids.client, responsibleId: ids.anna });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ client: { id: ids.client }, responsible: { id: ids.anna } });
    expect((await as("anna").get("/telegram/contacts?filter=mine")).body.data.map((item: { id: string }) => item.id)).toEqual([contact.id]);
    expect((await as("alex").get(`/telegram/contacts/${contact.id}`)).status).toBe(404);
    expect((await as("anna").patch(`/telegram/contacts/${contact.id}`, { responsibleId: ids.alex })).status).toBe(403);
  });

  it("puts every message, earlier ones included, in the client's history with the replying manager", async () => {
    const contact = await contactOf(100);
    const reply = await as("anna").post(`/telegram/contacts/${contact.id}/messages`, { text: "Доставка 150 грн" });
    expect(reply.status).toBe(201);
    expect(reply.body.data).toMatchObject({ status: "SENT", sentBy: { id: ids.anna } });
    expect(calls.at(-1)).toMatchObject({ method: "sendMessage", body: { chat_id: 100, text: "Доставка 150 грн" } });
    const history = (await as("head").get(`/clients/${ids.client}/communications`)).body.data;
    expect(history).toEqual([expect.objectContaining({ channel: "TELEGRAM", id: contact.id, owner: { id: ids.anna, fullName: "anna" } })]);
    const thread = (await as("boss").get(`/communications/telegram/${contact.id}`)).body.data;
    expect(thread.messages.map((item: { text: string }) => item.text)).toEqual(expect.arrayContaining(["Здравствуйте, сколько стоит доставка?", "Алло?", "Доставка 150 грн"]));
    expect(thread.messages.find((item: { text: string }) => item.text === "Доставка 150 грн").sentBy.id).toBe(ids.anna);
    expect((await as("olga").get(`/communications/telegram/${contact.id}`)).status).toBe(404);
    const [event] = await audit("TELEGRAM_MESSAGE_SENT");
    expect(JSON.stringify(event)).not.toContain("150");
  });

  it("creates a deal from the conversation and shows it in the deal's history", async () => {
    const contact = await contactOf(100);
    const deal = await as("anna").post(`/telegram/contacts/${contact.id}/deal`, { funnelId: ids.funnel, title: "Доставка", value: 1000 });
    expect(deal.status).toBe(201);
    expect((await as("anna").get(`/deals/${deal.body.data.dealId}/communications`)).body.data.map((item: { id: string }) => item.id)).toEqual([contact.id]);
  });

  it("binds through a single-use invite link with the creator responsible", async () => {
    const invite = await as("alex").post(`/clients/${ids.client}/telegram-invite`);
    expect(invite.status).toBe(404);
    const created = await as("anna").post(`/clients/${ids.client}/telegram-invite`);
    expect(created.status).toBe(201);
    const token = new URL(created.body.data.url).searchParams.get("start")!;
    expect(created.body.data.url).toMatch(/^https:\/\/t\.me\/atlas_test_bot\?start=/);
    expect((await harness.query("SELECT 1 FROM telegram_invites WHERE token_hash = $1", [token])).rows).toHaveLength(0);
    await webhook(message(200, `/start ${token}`));
    await settle();
    const bound = await contactOf(200);
    expect(bound).toMatchObject({ client_id: ids.client, responsible_id: ids.anna });
    expect(calls.filter((call) => call.body.chat_id === 200).map((call) => call.body.text)).toEqual(["Спасибо! Теперь ваш менеджер будет отвечать вам в этом чате."]);
    await webhook(message(201, `/start ${token}`));
    await settle();
    expect(await contactOf(201)).toMatchObject({ client_id: null, responsible_id: null });
  });

  it("marks a customer who blocked the bot and refuses further sends", async () => {
    await webhook(message(BLOCKED, "Привет"));
    await settle();
    const contact = await contactOf(BLOCKED);
    await as("boss").patch(`/telegram/contacts/${contact.id}`, { responsibleId: ids.anna });
    expect((await as("anna").post(`/telegram/contacts/${contact.id}/messages`, { text: "Здравствуйте" })).status).toBe(409);
    expect((await contactOf(BLOCKED)).status).toBe("BLOCKED");
    const again = await as("anna").post(`/telegram/contacts/${contact.id}/messages`, { text: "Ещё раз" });
    expect(again.body.error.code).toBe("TELEGRAM_CONTACT_BLOCKED");
    await webhook({ update_id: updateId++, my_chat_member: { chat: { id: BLOCKED, type: "private" }, from: { id: BLOCKED, first_name: "B" }, new_chat_member: { status: "member" } } });
    await settle();
    expect((await contactOf(BLOCKED)).status).toBe("ACTIVE");
  });

  it("previews an import, then applies only valid rows within the head's department", async () => {
    const csv = ["telegram_id;client_email;responsible;name", `${UNREACHABLE};sofia@client.example;anna;Импорт`, "abc;;;Плохой", `${UNREACHABLE};;;Повтор`,
      "300;nobody@x.example;;Нет клиента", "301;ops@client.example;;Чужой", "302;;olga;Чужой ответственный"].join("\n");
    expect((await as("anna").post("/telegram/import/preview", { csv })).status).toBe(403);
    const preview = (await as("head").post("/telegram/import/preview", { csv })).body.data;
    expect(preview.summary).toEqual({ new: 1, update: 0, unchanged: 0, error: 5 });
    expect(preview.rows.map((row: { error: string | null }) => row.error)).toEqual([null, "Неверный Telegram ID", "Повтор строки", "Клиент не найден", "Клиент вне вашего отдела", "Ответственный вне вашего отдела"]);
    expect(await harness.query("SELECT 1 FROM telegram_contacts WHERE telegram_user_id = $1", [UNREACHABLE]).then((result) => result.rows)).toHaveLength(0);
    const applied = (await as("head").post(`/telegram/import/${preview.id}/apply`)).body.data;
    expect(applied).toEqual({ applied: 1, rejected: 5, unchanged: 0 });
    expect(await contactOf(UNREACHABLE)).toMatchObject({ status: "UNVERIFIED", client_id: ids.client, responsible_id: ids.anna });
    expect((await audit("TELEGRAM_CONTACTS_IMPORTED"))[0]!.metadata).toEqual(applied);
  });

  it("explains that an imported customer who never wrote to this bot can't be reached", async () => {
    const contact = await contactOf(UNREACHABLE);
    const response = await as("anna").post(`/telegram/contacts/${contact.id}/messages`, { text: "Здравствуйте" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("TELEGRAM_CONTACT_UNREACHABLE");
  });

  it("downloads incoming photos and updates edited messages", async () => {
    const photo = message(200, "", { text: undefined, caption: "Чек", photo: [{ file_id: "ph1", file_size: 1000 }] });
    await webhook(photo);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const stored = (await harness.query<{ id: string; stored_path: string | null; kind: string }>("SELECT id, stored_path, kind FROM telegram_messages WHERE file_id = 'ph1'")).rows[0]!;
    expect(stored.kind).toBe("PHOTO");
    expect(stored.stored_path).not.toBeNull();
    const file = await as("anna").get(`/telegram/files/${stored.id}`);
    expect(file.status).toBe(200);
    expect(file.headers["content-disposition"]).toContain("attachment");
    await webhook({ update_id: updateId++, edited_message: { ...photo.message, caption: "Чек (исправлен)", edit_date: Math.floor(Date.now() / 1000) } });
    await settle();
    expect((await harness.query("SELECT text, edited_at IS NOT NULL AS edited FROM telegram_messages WHERE id = $1", [stored.id])).rows[0]).toEqual({ text: "Чек (исправлен)", edited: true });
  });

  it("keeps bot settings for directors and applies a new greeting", async () => {
    expect((await as("head").patch("/telegram/settings", { greetingText: "x" })).status).toBe(403);
    expect((await as("boss").patch("/telegram/settings", { greetingText: "Добрый день! Чем помочь?", defaultResponsibleId: ids.alex })).status).toBe(200);
    expect((await as("boss").get("/telegram/status")).body.data).toMatchObject({ configured: true, botUsername: "atlas_test_bot", greetingText: "Добрый день! Чем помочь?" });
    expect((await as("anna").get("/telegram/status")).body.data.greetingText).toBeUndefined();
    await webhook(message(400, "Новый вопрос"));
    await settle();
    expect(await contactOf(400)).toMatchObject({ responsible_id: ids.alex });
    expect(calls.filter((call) => call.body.chat_id === 400).map((call) => call.body.text)).toEqual(["Добрый день! Чем помочь?"]);
  });

  it("counts unread messages for the responsible user and clears them on read", async () => {
    const contact = await contactOf(400);
    expect((await as("alex").get("/telegram/unread")).body.data.unread).toBe(1);
    await as("alex").post(`/telegram/contacts/${contact.id}/read`);
    expect((await as("alex").get("/telegram/unread")).body.data.unread).toBe(0);
  });
});
