/** Mail API end to end through the Express app, with real Postgres, IMAP and SMTP (see test/mailHarness.ts). */
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rawMessage as raw, startMailHarness } from "../test/mailHarness";
import type { AuthContext } from "../types";

let harness: Awaited<ReturnType<typeof startMailHarness>>;
let app: Express;
let tokens: Record<"anna" | "head" | "boss" | "alex", string>;
let ids: { company: string; client: string; funnel: string; anna: string };
const imapSettings = () => ({ email: "anna@atlas.example", imap: { host: "imap.test", port: 993, security: "SSL" }, smtp: { host: "smtp.test", port: 465, security: "SSL" }, username: "anna" });

const as = (who: keyof typeof tokens) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${tokens[who]}`),
  post: (path: string, body?: object) => request(app).post(`/api/v1${path}`).set("Authorization", `Bearer ${tokens[who]}`).send(body ?? {}),
  patch: (path: string, body: object) => request(app).patch(`/api/v1${path}`).set("Authorization", `Bearer ${tokens[who]}`).send(body),
  delete: (path: string) => request(app).delete(`/api/v1${path}`).set("Authorization", `Bearer ${tokens[who]}`)
});

async function until<T>(check: () => Promise<T | undefined | false>, timeout = 15_000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

beforeAll(async () => {
  harness = await startMailHarness([
    raw({ "Message-ID": "<p1@client.example>", From: "Sofia <sofia@client.example>", To: "anna@atlas.example", Subject: "Предложение" }, "Ждём предложение"),
    raw({ "Message-ID": "<x1@friend.example>", From: "friend@friend.example", To: "anna@atlas.example", Subject: "Личное" }, "Привет")
  ]);
  const { query } = harness;
  const { signAccessToken } = await import("../auth");
  app = (await import("../app")).app;
  const company = (await query<{ id: string }>("INSERT INTO companies (name) VALUES ('Test') RETURNING id")).rows[0]!.id;
  const sales = (await query<{ id: string }>("INSERT INTO departments (company_id, name) VALUES ($1, 'Sales') RETURNING id", [company])).rows[0]!.id;
  const user = async (username: string, role: AuthContext["role"]) => {
    const id = (await query<{ id: string }>("INSERT INTO users (company_id, department_id, username, password_hash, role, full_name) VALUES ($1, $2, $3, 'x', $4, $3) RETURNING id", [company, sales, username, role])).rows[0]!.id;
    return { id, token: signAccessToken({ userId: id, companyId: company, departmentId: sales, username, role }) };
  };
  const anna = await user("anna", "EMPLOYEE"), head = await user("head", "MANAGER"), boss = await user("boss", "DIRECTOR"), alex = await user("alex", "EMPLOYEE");
  tokens = { anna: anna.token, head: head.token, boss: boss.token, alex: alex.token };
  const client = (await query<{ id: string }>("INSERT INTO clients (company_id, department_id, owner_id, name, email) VALUES ($1, $2, $3, 'Sofia', 'sofia@client.example') RETURNING id", [company, sales, anna.id])).rows[0]!.id;
  const funnel = (await query<{ id: string }>("INSERT INTO deal_funnels (company_id, name) VALUES ($1, 'Основная') RETURNING id", [company])).rows[0]!.id;
  await query("INSERT INTO deal_stages (company_id, funnel_id, name, color, sort_order, outcome) VALUES ($1, $2, 'Новая', '#6B7280', 10, 'OPEN')", [company, funnel]);
  ids = { company, client, funnel, anna: anna.id };
}, 60_000);

afterAll(async () => { await harness?.stop(); });

const audit = async (action: string) => (await harness.query<{ metadata: Record<string, unknown> }>("SELECT metadata FROM audit_logs WHERE action = $1 ORDER BY created_at", [action])).rows;

describe("mail API", () => {
  let accountId = "";
  let threadId = "";

  it("reports which ways of connecting are available", async () => {
    const response = await as("anna").get("/mail/providers");
    expect(response.body.data).toEqual({ imap: true, google: false, microsoft: false });
    expect((await as("anna").get("/mail/oauth/google/start")).status).toBe(501);
  });

  it("rejects a wrong password with a Russian reason and saves nothing", async () => {
    const response = await as("anna").post("/mail/accounts", { ...imapSettings(), password: "wrong" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("MAIL_CONNECTION_FAILED");
    expect(response.body.error.message).toContain("Неверный логин или пароль");
    expect((await as("anna").get("/mail/accounts")).body.data).toEqual([]);
    expect((await audit("MAIL_ACCOUNT_CONNECT_FAILED"))[0]!.metadata).toEqual({ provider: "IMAP", reason: "AUTH" });
  });

  it("connects a mailbox without ever returning the password, once per address", async () => {
    const response = await as("anna").post("/mail/accounts", { ...imapSettings(), password: "app-pass", signature: "Анна" });
    expect(response.status).toBe(201);
    expect(JSON.stringify(response.body)).not.toMatch(/app-pass|secret/);
    accountId = response.body.data.id;
    expect((await as("anna").post("/mail/accounts", { ...imapSettings(), password: "app-pass" })).status).toBe(409);
    const stored = await harness.query<{ secret: unknown }>("SELECT secret FROM mail_accounts WHERE id = $1", [accountId]);
    expect(JSON.stringify(stored.rows[0]!.secret)).not.toContain("app-pass");
  });

  it("syncs and auto-links the client's thread, private to the owner", async () => {
    await until(async () => (await as("anna").get("/mail/accounts")).body.data[0]?.lastSyncedAt);
    const threads = (await as("anna").get(`/mail/threads?accountId=${accountId}`)).body.data as Array<{ id: string; subject: string; client: { id: string } | null }>;
    expect(threads).toHaveLength(2);
    const linked = threads.find((thread) => thread.subject === "Предложение")!;
    expect(linked.client?.id).toBe(ids.client);
    expect(threads.find((thread) => thread.subject === "Личное")!.client).toBeNull();
    threadId = linked.id;
    expect((await as("boss").get(`/mail/threads/${threadId}`)).status).toBe(404);
    expect((await as("boss").get("/mail/threads")).body.data).toEqual([]);
    const folders = (await as("anna").get(`/mail/accounts/${accountId}/folders`)).body.data as Array<{ specialUse: string; name: string }>;
    expect(folders[0]).toMatchObject({ specialUse: "INBOX", name: "Входящие" });
    expect((await as("boss").get(`/mail/accounts/${accountId}/folders`)).status).toBe(404);
  });

  it("finds mail by words and marks a thread read when opened", async () => {
    expect((await as("anna").get("/mail/threads?q=предложение")).body.data).toHaveLength(1);
    const thread = (await as("anna").get(`/mail/threads/${threadId}`)).body.data;
    expect(thread.messages).toHaveLength(1);
    expect((await as("anna").get("/mail/unread")).body.data.unread).toBe(1);
  });

  it("shows linked mail read-only to the head and director, not to another employee", async () => {
    const history = (await as("head").get(`/clients/${ids.client}/communications`)).body.data;
    expect(history).toEqual([expect.objectContaining({ channel: "EMAIL", id: threadId, title: "Предложение", owner: { id: ids.anna, fullName: "anna" } })]);
    expect((await as("boss").get(`/communications/mail/${threadId}`)).body.data.messages).toHaveLength(1);
    expect((await as("alex").get(`/clients/${ids.client}/communications`)).status).toBe(404);
    expect((await as("alex").get(`/communications/mail/${threadId}`)).status).toBe(404);
    expect((await as("head").post("/mail/actions", { threadIds: [threadId], action: "archive" })).status).toBe(404);
  });

  it("sends a reply with Bcc hidden from recipients and audits it without content", async () => {
    const thread = (await as("anna").get(`/mail/threads/${threadId}`)).body.data;
    const draft = (await as("anna").post("/mail/drafts", {
      accountId, mode: "REPLY", sourceMessageId: thread.messages[0].id, to: [{ address: "sofia@client.example" }], bcc: [{ address: "boss@atlas.example" }],
      subject: "Re: Предложение", html: "<p>Цена 150 грн</p>"
    })).body.data;
    const sent = await as("anna").post("/mail/send", { draftId: draft.id });
    expect(sent.status).toBe(201);
    expect(sent.body.data.threadId).toBe(threadId);
    const { simpleParser } = await import("mailparser");
    const delivered = await simpleParser(harness.delivered.at(-1)!.raw);
    expect(delivered.html).toContain("Анна");
    expect(delivered.text).toContain("Цена 150 грн");
    expect(harness.delivered.at(-1)!.raw).not.toMatch(/^Bcc:/mi);
    const [event] = await audit("MAIL_SENT");
    expect(event!.metadata).toMatchObject({ accountId, recipientCount: 2, clientId: ids.client });
    expect(JSON.stringify(event)).not.toMatch(/sofia@|Предложение|150/);
    const ownerView = (await as("anna").get(`/mail/threads/${threadId}`)).body.data.messages.at(-1);
    expect(ownerView.bcc).toEqual([{ address: "boss@atlas.example" }]);
    const headView = (await as("head").get(`/communications/mail/${threadId}`)).body.data.messages.at(-1);
    expect(headView.bcc).toEqual([]);
  });

  it("creates a deal from the thread and shows it in the deal's history", async () => {
    const response = await as("anna").post(`/mail/threads/${threadId}/deal`, { funnelId: ids.funnel, value: 5000 });
    expect(response.status).toBe(201);
    const history = (await as("anna").get(`/deals/${response.body.data.dealId}/communications`)).body.data;
    expect(history.map((entry: { id: string }) => entry.id)).toEqual([threadId]);
    expect((await audit("DEAL_CREATED"))).toHaveLength(1);
  });

  it("keeps an unlinked thread private and never relinks it automatically", async () => {
    await as("anna").patch(`/mail/threads/${threadId}/link`, { clientId: null, dealId: null });
    expect((await as("head").get(`/clients/${ids.client}/communications`)).body.data).toEqual([]);
    const { autoLink } = await import("../mail/sync");
    expect(await autoLink([threadId])).toEqual([]);
    expect((await as("anna").patch(`/mail/threads/${threadId}/link`, { clientId: ids.client })).body.data.client.id).toBe(ids.client);
    expect((await audit("MAIL_THREAD_UNLINKED"))).toHaveLength(1);
  });

  it("limits sending to 100 messages an hour", async () => {
    await harness.query(
      `INSERT INTO mail_messages (thread_id, account_id, send_status, created_at) SELECT $1, $2, 'SENT', now() FROM generate_series(1, 100)`,
      [threadId, accountId]
    );
    const draft = (await as("anna").post("/mail/drafts", { accountId, to: [{ address: "x@client.example" }], subject: "x", html: "x" })).body.data;
    const response = await as("anna").post("/mail/send", { draftId: draft.id });
    expect(response.status).toBe(429);
    expect((await as("anna").get("/mail/drafts")).body.data.map((item: { id: string }) => item.id)).toContain(draft.id);
    await harness.query("DELETE FROM mail_messages WHERE thread_id = $1 AND from_address = ''", [threadId]);
  });

  it("lists only the caller's mailboxes in integration status", async () => {
    const mine = (await as("anna").get("/integrations")).body.data.find((item: { provider: string }) => item.provider === "MAIL_IMAP");
    expect(mine).toMatchObject({ serverConfigured: true, status: "CONNECTED", mailboxes: [expect.objectContaining({ email: "anna@atlas.example" })] });
    const boss = (await as("boss").get("/integrations")).body.data.find((item: { provider: string }) => item.provider === "MAIL_IMAP");
    expect(boss).toMatchObject({ status: "DISCONNECTED", mailboxes: [] });
    expect((await as("boss").get("/integrations")).body.data.find((item: { provider: string }) => item.provider === "MAIL_GOOGLE").serverConfigured).toBe(false);
  });

  it("disconnects, keeping linked history and dropping private mail", async () => {
    expect((await as("anna").delete(`/mail/accounts/${accountId}`)).status).toBe(204);
    expect((await as("anna").get("/mail/accounts")).body.data).toEqual([]);
    expect((await as("head").get(`/clients/${ids.client}/communications`)).body.data.map((entry: { id: string }) => entry.id)).toEqual([threadId]);
    expect((await harness.query("SELECT id FROM mail_threads WHERE subject = 'Личное'")).rows).toEqual([]);
    expect((await audit("MAIL_ACCOUNT_DISCONNECTED"))).toHaveLength(1);
  });
});
