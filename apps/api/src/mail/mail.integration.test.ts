/** Mail sync, actions and sending against real servers (see test/mailHarness.ts). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rawMessage as raw, startMailHarness } from "../test/mailHarness";
import { simpleParser } from "mailparser";

let harness: Awaited<ReturnType<typeof startMailHarness>>;
let ids: { company: string; user: string; client: string; account: string };
const serverClient = () => harness.serverClient();

beforeAll(async () => {
  harness = await startMailHarness([
    raw({ "Message-ID": "<q1@client.example>", From: "Sofia <sofia@client.example>", To: "anna@atlas.example", Subject: "Запрос цены", "Content-Type": "text/html; charset=utf-8" },
      '<p>Пришлите цену</p><img src="https://tracker.example/p.gif"><script>alert(1)</script>'),
    raw({ "Message-ID": "<n1@news.example>", From: "news@news.example", To: "anna@atlas.example", Subject: "Новости" }, "Дайджест")
  ]);
  const { query } = harness;
  const { sealSecret } = await import("./crypto");
  const company = (await query<{ id: string }>("INSERT INTO companies (name) VALUES ('Test') RETURNING id")).rows[0]!.id;
  const department = (await query<{ id: string }>("INSERT INTO departments (company_id, name) VALUES ($1, 'Sales') RETURNING id", [company])).rows[0]!.id;
  const user = (await query<{ id: string }>("INSERT INTO users (company_id, department_id, username, password_hash, role, full_name) VALUES ($1, $2, 'anna', 'x', 'EMPLOYEE', 'Anna') RETURNING id", [company, department])).rows[0]!.id;
  const client = (await query<{ id: string }>("INSERT INTO clients (company_id, department_id, owner_id, name, email) VALUES ($1, $2, $3, 'Sofia', 'Sofia@Client.example') RETURNING id", [company, department, user])).rows[0]!.id;
  const account = (await query<{ id: string }>(
    `INSERT INTO mail_accounts (company_id, user_id, provider, email, imap_host, imap_port, imap_security, smtp_host, smtp_port, smtp_security, username, secret)
     VALUES ($1, $2, 'IMAP', 'anna@atlas.example', 'imap.test', 993, 'SSL', 'smtp.test', 465, 'SSL', 'anna', $3) RETURNING id`,
    [company, user, JSON.stringify(sealSecret("app-pass"))]
  )).rows[0]!.id;
  ids = { company, user, client, account };
}, 60_000);

afterAll(async () => { await harness?.stop(); });

const q = async <T extends Record<string, unknown>>(sql: string, values: unknown[] = []) => (await harness.query<T>(sql, values)).rows;

describe("mail sync", () => {
  it("syncs folders and messages, sanitizes HTML and auto-links the client thread", async () => {
    const { syncAccount } = await import("./sync");
    const result = await syncAccount(ids.account);
    expect(result.newMessages).toBe(2);
    const folders = await q<{ special_use: string; name: string }>("SELECT special_use, name FROM mail_folders WHERE account_id = $1 ORDER BY name", [ids.account]);
    expect(folders.map((row) => row.special_use).sort()).toEqual(["ARCHIVE", "INBOX", "JUNK", "SENT", "TRASH"]);
    const [quote] = await q<{ html_body: string; has_remote_images: boolean; seen: boolean; client_id: string; link_source: string }>(
      "SELECT m.html_body, m.has_remote_images, m.seen, t.client_id, t.link_source FROM mail_messages m JOIN mail_threads t ON t.id = m.thread_id WHERE m.message_id_header = '<q1@client.example>'");
    expect(quote!.html_body).not.toMatch(/script| src="https/);
    expect(quote!.html_body).toContain("Пришлите цену");
    expect(quote!.has_remote_images).toBe(true);
    expect(quote!.seen).toBe(false);
    expect(quote!.client_id).toBe(ids.client);
    expect(quote!.link_source).toBe("AUTO");
    const [news] = await q<{ client_id: string | null }>("SELECT t.client_id FROM mail_threads t WHERE t.subject = 'Новости'");
    expect(news!.client_id).toBeNull();
  });

  it("fetches only new mail and reflects flags changed in another client", async () => {
    const other = await serverClient();
    await other.append("INBOX", raw({ "Message-ID": "<q2@client.example>", "In-Reply-To": "<q1@client.example>", References: "<q1@client.example>", From: "sofia@client.example", To: "anna@atlas.example", Subject: "Re: Запрос цены", Date: new Date().toUTCString() }, "Ещё вопрос"));
    const lock = await other.getMailboxLock("INBOX");
    await other.messageFlagsAdd("1", ["\\Seen"], { uid: true });
    lock.release();
    await other.logout();
    const { syncAccount } = await import("./sync");
    expect((await syncAccount(ids.account)).newMessages).toBe(1);
    const thread = await q<{ message_count: number; unread_count: number }>("SELECT message_count, unread_count FROM mail_threads WHERE client_id = $1", [ids.client]);
    expect(thread).toEqual([{ message_count: 2, unread_count: 1 }]);
  });

  it("archives on the server first, then locally", async () => {
    const { applyAction } = await import("./actions");
    const { loadAccount } = await import("./sync");
    const [news] = await q<{ id: string }>("SELECT id FROM mail_messages WHERE message_id_header = '<n1@news.example>'");
    await applyAction((await loadAccount(ids.account))!, [news!.id], "archive");
    const [local] = await q<{ path: string }>("SELECT f.path FROM mail_messages m JOIN mail_folders f ON f.id = m.folder_id WHERE m.id = $1", [news!.id]);
    expect(local!.path).toBe("Archive");
    const other = await serverClient();
    const status = await other.status("Archive", { messages: true });
    await other.logout();
    expect(status.messages).toBe(1);
    const { syncAccount } = await import("./sync");
    await syncAccount(ids.account, { full: true });
    expect(await q("SELECT id FROM mail_messages WHERE message_id_header = '<n1@news.example>'")).toHaveLength(1);
  });

  it("sends a reply in the thread, saves it to Sent and does not duplicate it on the next sync", async () => {
    const { query } = await import("../db");
    const { sendDraft } = await import("./send");
    const { loadAccount, syncAccount } = await import("./sync");
    const [source] = await q<{ id: string; thread_id: string }>("SELECT id, thread_id FROM mail_messages WHERE message_id_header = '<q2@client.example>'");
    const [draft] = (await query<Record<string, unknown>>(
      `INSERT INTO mail_drafts (account_id, user_id, mode, source_message_id, to_addresses, bcc_addresses, subject, html)
       VALUES ($1, $2, 'REPLY', $3, '[{"address":"sofia@client.example"}]', '[{"address":"boss@atlas.example"}]', 'Re: Запрос цены', '<p>Цена 150 грн</p>') RETURNING *`,
      [ids.account, ids.user, source!.id]
    )).rows;
    const sent = await sendDraft((await loadAccount(ids.account))!, draft as never);
    expect(sent.threadId).toBe(source!.thread_id);
    expect(harness.delivered).toHaveLength(1);
    expect(harness.delivered[0]!.to.sort()).toEqual(["boss@atlas.example", "sofia@client.example"]);
    const parsed = await simpleParser(harness.delivered[0]!.raw);
    expect(parsed.inReplyTo).toBe("<q2@client.example>");
    expect(String(parsed.references)).toContain("<q1@client.example>");
    expect(harness.delivered[0]!.raw).not.toMatch(/^Bcc:/mi);
    expect(await q("SELECT id FROM mail_drafts WHERE id = $1", [draft!.id])).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await syncAccount(ids.account, { full: true });
    const copies = await q<{ send_status: string; folder: string | null }>(
      "SELECT m.send_status, f.path AS folder FROM mail_messages m LEFT JOIN mail_folders f ON f.id = m.folder_id WHERE m.subject = 'Re: Запрос цены' AND m.from_address = 'anna@atlas.example'");
    expect(copies).toEqual([{ send_status: "SENT", folder: "Sent" }]);
  });

  it("keeps the draft and marks the copy FAILED when SMTP rejects the login", async () => {
    const { query } = await import("../db");
    const { sendDraft } = await import("./send");
    const { loadAccount } = await import("./sync");
    const { sealSecret } = await import("./crypto");
    const account = (await loadAccount(ids.account))!;
    const [draft] = (await query<Record<string, unknown>>(
      `INSERT INTO mail_drafts (account_id, user_id, to_addresses, subject, html) VALUES ($1, $2, '[{"address":"x@client.example"}]', 'Новое', '<p>x</p>') RETURNING *`,
      [ids.account, ids.user]
    )).rows;
    await expect(sendDraft({ ...account, secret: sealSecret("wrong") }, draft as never)).rejects.toMatchObject({ code: "MAIL_SEND_FAILED" });
    expect(await q("SELECT id FROM mail_drafts WHERE id = $1", [draft!.id])).toHaveLength(1);
    expect(await q("SELECT send_status FROM mail_messages WHERE subject = 'Новое'")).toEqual([{ send_status: "FAILED" }]);
  });

  it("pauses a mailbox whose password stopped working", async () => {
    const { query } = await import("../db");
    const { sealSecret } = await import("./crypto");
    const { syncAccount } = await import("./sync");
    await query("UPDATE mail_accounts SET secret = $2 WHERE id = $1", [ids.account, JSON.stringify(sealSecret("wrong"))]);
    await expect(syncAccount(ids.account)).rejects.toBeTruthy();
    expect(await q("SELECT status, status_reason FROM mail_accounts WHERE id = $1", [ids.account])).toEqual([{ status: "NEEDS_ATTENTION", status_reason: "Неверный логин или пароль" }]);
  });
});
