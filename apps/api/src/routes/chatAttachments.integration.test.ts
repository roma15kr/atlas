/** Files attached to chat messages, end to end through the Express app, real migrations and local storage. */
import { startDbHarness, type TestUser } from "../test/dbHarness";

// A 1 MB limit keeps the oversize check cheap; production uses MAX_UPLOAD_MB (20 by default).
process.env.MAX_UPLOAD_MB = "1";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let hisham: TestUser, roman: TestUser, outsider: TestUser;
let general: string, secret: string;
let otherCompanyToken: string;

const XLSX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("fake-xlsx-body")]);
const PDF = Buffer.from("%PDF-1.7 накладна");
const EXE = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(64, 1)]);
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const upload = (who: TestUser | string, conversation: string, body: Buffer, name: string) =>
  request(app).post(`/api/v1/chat/conversations/${conversation}/attachments`).set(auth(typeof who === "string" ? who : who.token)).attach("file", body, name);
const post = (who: TestUser, conversation: string, body: object) =>
  request(app).post(`/api/v1/chat/conversations/${conversation}/messages`).set(auth(who.token)).send(body);
const download = (who: TestUser | string, id: string) =>
  request(app).get(`/api/v1/chat/attachments/${id}`).set(auth(typeof who === "string" ? who : who.token)).buffer(true).parse((res, done) => {
    const chunks: Buffer[] = [];
    res.on("data", (chunk: Buffer) => chunks.push(chunk));
    res.on("end", () => done(null, Buffer.concat(chunks)));
  });

beforeAll(async () => {
  harness = await startDbHarness();
  const { memoryPresenceStore, setPresenceStore } = await import("../presence");
  setPresenceStore(memoryPresenceStore());
  app = (await import("../app")).app;
  hisham = await harness.user("harrud", "EMPLOYEE", "Склад", { consent: true });
  roman = await harness.user("ponomarenko", "DIRECTOR", "Руководство", { consent: true });
  outsider = await harness.user("kosian", "EMPLOYEE", "Склад", { consent: true });
  general = (await request(app).post("/api/v1/chat/channels").set(auth(roman.token)).send({ name: "Склад-новини", visibility: "PUBLIC", memberIds: [hisham.id] })).body.data.id;
  secret = (await request(app).post("/api/v1/chat/channels").set(auth(roman.token)).send({ name: "Керівництво", visibility: "PRIVATE", memberIds: [hisham.id] })).body.data.id;
  const other = (await harness.query<{ id: string }>("INSERT INTO companies (name) VALUES ('Other') RETURNING id")).rows[0]!.id;
  const stranger = (await harness.query<{ id: string }>(
    "INSERT INTO users (company_id, username, password_hash, role, full_name) VALUES ($1, 'stranger', 'x', 'DIRECTOR', 'Stranger') RETURNING id", [other])).rows[0]!.id;
  const { signAccessToken } = await import("../auth");
  otherCompanyToken = signAccessToken({ userId: stranger, companyId: other, departmentId: null, username: "stranger", role: "DIRECTOR" });
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("chat attachments", () => {
  it("shares a spreadsheet as a file-only message that members download byte for byte", async () => {
    const uploaded = await upload(hisham, general, XLSX, "для складу.xlsx");
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.data).toMatchObject({ fileName: "для складу.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: XLSX.length });
    const sent = await post(hisham, general, { attachmentIds: [uploaded.body.data.id] });
    expect(sent.status).toBe(201);
    expect(sent.body.data.body).toBe("");
    expect(sent.body.data.attachments).toEqual([expect.objectContaining({ id: uploaded.body.data.id, fileName: "для складу.xlsx" })]);

    const file = await download(roman, uploaded.body.data.id);
    expect(file.status).toBe(200);
    expect(Buffer.compare(file.body as Buffer, XLSX)).toBe(0);
    expect(file.headers["content-disposition"]).toBe(`attachment; filename*=UTF-8''${encodeURIComponent("для складу.xlsx")}`);
    expect(file.headers["x-content-type-options"]).toBe("nosniff");

    const audit = (await harness.query<{ metadata: Record<string, unknown> }>(
      "SELECT metadata FROM audit_logs WHERE action = 'CHAT_ATTACHMENT_UPLOADED' AND actor_id = $1 ORDER BY created_at DESC LIMIT 1", [hisham.id])).rows[0]!;
    expect(audit.metadata).toMatchObject({ attachmentId: uploaded.body.data.id, size: XLSX.length });
    expect(JSON.stringify(audit.metadata)).not.toContain("для складу");
  });

  it("answers 404 to someone who can't read the conversation, and to another company", async () => {
    const uploaded = await upload(hisham, secret, PDF, "накладна.pdf");
    await post(hisham, secret, { body: "Накладна", attachmentIds: [uploaded.body.data.id] });
    expect((await download(outsider, uploaded.body.data.id)).status).toBe(404);
    expect((await download(otherCompanyToken, uploaded.body.data.id)).status).toBe(404);
    expect((await download(roman, uploaded.body.data.id)).status).toBe(200);
  });

  it("lets only the uploader open a file that hasn't been sent yet", async () => {
    const uploaded = await upload(hisham, general, PDF, "чернетка.pdf");
    expect((await download(hisham, uploaded.body.data.id)).status).toBe(200);
    expect((await download(roman, uploaded.body.data.id)).status).toBe(404);
  });

  it("rejects programs, binary text and files over the limit", async () => {
    const exe = await upload(hisham, general, EXE, "прайс.pdf");
    expect(exe.status).toBe(400);
    expect(exe.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
    expect((await upload(hisham, general, EXE, "setup.exe")).body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
    expect((await upload(hisham, general, Buffer.from([0x41, 0x00, 0x42]), "notes.txt")).body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
    const big = await upload(hisham, general, Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(1024 * 1024)]), "big.zip");
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe("FILE_TOO_LARGE");
  });

  it("refuses to post a file uploaded by someone else or to another conversation", async () => {
    const romans = await upload(roman, general, PDF, "наказ.pdf");
    const elsewhere = await upload(hisham, secret, PDF, "інше.pdf");
    for (const id of [romans.body.data.id, elsewhere.body.data.id]) {
      const response = await post(hisham, general, { body: "Ось", attachmentIds: [id] });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("CHAT_INVALID_ATTACHMENT");
    }
    expect((await post(hisham, general, { body: "" })).status).toBe(400);
  });

  it("previews a file-only direct message by its file name", async () => {
    const dm = (await request(app).post("/api/v1/chat/direct").set(auth(hisham.token)).send({ userId: roman.id })).body.data.id as string;
    const uploaded = await upload(hisham, dm, XLSX, "залишки.xlsx");
    await post(hisham, dm, { attachmentIds: [uploaded.body.data.id] });
    const inbox = (await request(app).get("/api/v1/notifications").set(auth(roman.token))).body.data as Array<{ kind: string; body: string | null }>;
    expect(inbox.find((item) => item.kind === "CHAT_DIRECT")?.body).toBe("📎 залишки.xlsx");
  });

  it("erases a message's files with it", async () => {
    const uploaded = await upload(hisham, general, PDF, "видалити.pdf");
    const message = (await post(hisham, general, { body: "Тимчасово", attachmentIds: [uploaded.body.data.id] })).body.data.id as string;
    const key = (await harness.query<{ storage_key: string }>("SELECT storage_key FROM chat_attachments WHERE id = $1", [uploaded.body.data.id])).rows[0]!.storage_key;
    expect((await request(app).delete(`/api/v1/chat/messages/${message}`).set(auth(hisham.token))).status).toBe(204);
    expect((await harness.query("SELECT 1 FROM chat_attachments WHERE id = $1", [uploaded.body.data.id])).rowCount).toBe(0);
    expect((await download(hisham, uploaded.body.data.id)).status).toBe(404);
    const { objectStorage } = await import("../storage");
    expect(await objectStorage.get(key).catch(() => null)).toBeNull();
  });

  it("cleans up uploads that were never sent after a day", async () => {
    const uploaded = await upload(hisham, general, PDF, "забуто.pdf");
    await harness.query("UPDATE chat_attachments SET created_at = now() - interval '25 hours' WHERE id = $1", [uploaded.body.data.id]);
    const { cleanupStaleChatUploads } = await import("../automation/chatUploads");
    expect(await cleanupStaleChatUploads()).toBeGreaterThanOrEqual(1);
    expect((await harness.query("SELECT 1 FROM chat_attachments WHERE id = $1", [uploaded.body.data.id])).rowCount).toBe(0);
  });
});
