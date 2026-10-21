/** Files on task comments: shared with everyone who can see the task, and nobody else. */
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let seller: TestUser, colleague: TestUser, salesHead: TestUser, warehouse: TestUser, accountant: TestUser;
let salesBoard: string, taskId: string;

const XLSX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("fake-price-list")]);
const PDF = Buffer.from("%PDF-1.7 акт");
const auth = (who: TestUser) => ({ Authorization: `Bearer ${who.token}` });
const upload = (who: TestUser, task: string, body: Buffer, name: string) =>
  request(app).post(`/api/v1/tasks/${task}/attachments`).set(auth(who)).attach("file", body, name);
const comment = (who: TestUser, task: string, body: object) => request(app).post(`/api/v1/tasks/${task}/comments`).set(auth(who)).send(body);
const download = (who: TestUser, id: string) =>
  request(app).get(`/api/v1/tasks/attachments/${id}`).set(auth(who)).buffer(true).parse((res, done) => {
    const chunks: Buffer[] = [];
    res.on("data", (chunk: Buffer) => chunks.push(chunk));
    res.on("end", () => done(null, Buffer.concat(chunks)));
  });

beforeAll(async () => {
  harness = await startDbHarness();
  const { memoryPresenceStore, setPresenceStore } = await import("../presence");
  setPresenceStore(memoryPresenceStore());
  app = (await import("../app")).app;
  seller = await harness.user("trubylo", "EMPLOYEE", "Отдел продаж", { consent: true });
  colleague = await harness.user("babenko", "EMPLOYEE", "Отдел продаж", { consent: true });
  salesHead = await harness.user("denysiuk", "MANAGER", "Отдел продаж", { consent: true });
  warehouse = await harness.user("kosian", "EMPLOYEE", "Склад", { consent: true });
  accountant = await harness.user("kruciak", "EMPLOYEE", "Бухгалтерия", { consent: true });
  salesBoard = (await harness.query<{ id: string }>("SELECT id FROM task_boards WHERE department_id = $1", [seller.departmentId])).rows[0]!.id;
  taskId = (await request(app).post("/api/v1/tasks").set(auth(seller)).send({ boardId: salesBoard, title: "Відвантаження «Олді»", assigneeIds: [seller.id, warehouse.id] })).body.data.id;
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("task comment attachments", () => {
  it("posts a price list as a file-only comment that board members and the outside assignee download", async () => {
    const uploaded = await upload(seller, taskId, XLSX, "прайс.xlsx");
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.data).toMatchObject({ fileName: "прайс.xlsx", size: XLSX.length });
    const posted = await comment(seller, taskId, { attachmentIds: [uploaded.body.data.id] });
    expect(posted.status).toBe(201);
    expect(posted.body.data.attachments).toEqual([expect.objectContaining({ id: uploaded.body.data.id, fileName: "прайс.xlsx" })]);

    const listed = (await request(app).get(`/api/v1/tasks/${taskId}/comments`).set(auth(colleague))).body.data as Array<{ attachments: unknown[] }>;
    expect(listed.at(-1)!.attachments).toHaveLength(1);
    for (const who of [colleague, salesHead, warehouse]) {
      const file = await download(who, uploaded.body.data.id);
      expect(file.status).toBe(200);
      expect(Buffer.compare(file.body as Buffer, XLSX)).toBe(0);
    }
    const audit = (await harness.query<{ metadata: Record<string, unknown> }>(
      "SELECT metadata FROM audit_logs WHERE action = 'TASK_ATTACHMENT_UPLOADED' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1", [taskId])).rows[0]!;
    expect(audit.metadata).toMatchObject({ attachmentId: uploaded.body.data.id, size: XLSX.length });
    expect(JSON.stringify(audit.metadata)).not.toContain("прайс");
  });

  it("answers 404 to someone who can't see the task, for the upload and the download", async () => {
    const uploaded = await upload(seller, taskId, PDF, "акт.pdf");
    await comment(seller, taskId, { body: "Акт", attachmentIds: [uploaded.body.data.id] });
    expect((await download(accountant, uploaded.body.data.id)).status).toBe(404);
    expect((await upload(accountant, taskId, PDF, "чуже.pdf")).status).toBe(404);
  });

  it("previews a file-only comment in the notification by its file name", async () => {
    await request(app).post("/api/v1/notifications/read-all").set(auth(warehouse));
    const uploaded = await upload(seller, taskId, PDF, "накладна.pdf");
    await comment(seller, taskId, { attachmentIds: [uploaded.body.data.id] });
    const inbox = (await request(app).get("/api/v1/notifications").set(auth(warehouse))).body.data as Array<{ kind: string; body: string | null }>;
    expect(inbox.find((item) => item.kind === "TASK_COMMENTED")?.body).toBe("📎 накладна.pdf");
  });

  it("keeps an unposted file to its uploader, and refuses someone else's upload", async () => {
    const mine = await upload(seller, taskId, PDF, "чернетка.pdf");
    expect((await download(seller, mine.body.data.id)).status).toBe(200);
    expect((await download(colleague, mine.body.data.id)).status).toBe(404);
    const response = await comment(colleague, taskId, { body: "Ось", attachmentIds: [mine.body.data.id] });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("TASK_INVALID_ATTACHMENT");
    expect((await comment(colleague, taskId, { body: "" })).status).toBe(400);
  });

  it("rejects a program renamed to a document", async () => {
    const response = await upload(seller, taskId, Buffer.concat([Buffer.from("MZ"), Buffer.alloc(32, 1)]), "рахунок.pdf");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it("deletes the files with the task, rows and stored objects", async () => {
    const task = (await request(app).post("/api/v1/tasks").set(auth(seller)).send({ boardId: salesBoard, title: "Тимчасова" })).body.data.id as string;
    const uploaded = await upload(seller, task, PDF, "видалити.pdf");
    await comment(seller, task, { attachmentIds: [uploaded.body.data.id] });
    const key = (await harness.query<{ storage_key: string }>("SELECT storage_key FROM task_comment_attachments WHERE id = $1", [uploaded.body.data.id])).rows[0]!.storage_key;
    expect((await request(app).delete(`/api/v1/tasks/${task}`).set(auth(seller))).status).toBe(204);
    expect((await harness.query("SELECT 1 FROM task_comment_attachments WHERE id = $1", [uploaded.body.data.id])).rowCount).toBe(0);
    const { objectStorage } = await import("../storage");
    expect(await objectStorage.get(key).catch(() => null)).toBeNull();
  });

  it("cleans up task uploads never posted after a day", async () => {
    const uploaded = await upload(seller, taskId, PDF, "забуто.pdf");
    await harness.query("UPDATE task_comment_attachments SET created_at = now() - interval '25 hours' WHERE id = $1", [uploaded.body.data.id]);
    const { cleanupStaleUploads } = await import("../automation/uploads");
    expect(await cleanupStaleUploads()).toBeGreaterThanOrEqual(1);
    expect((await harness.query("SELECT 1 FROM task_comment_attachments WHERE id = $1", [uploaded.body.data.id])).rowCount).toBe(0);
  });
});
