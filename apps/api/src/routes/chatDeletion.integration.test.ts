/** Deleting a chat message erases it: the row, reactions, mentions, notifications and images only it used. */
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let head: TestUser, seller: TestUser, colleague: TestUser, boss: TestUser;
let channel: string;
let board: string;
const emitted: Array<{ rooms: string[]; event: string; payload: Record<string, unknown> }> = [];

const as = (who: TestUser) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`),
  post: (path: string, body: object = {}) => request(app).post(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body),
  delete: (path: string) => request(app).delete(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`)
});
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("fake-png-body")]);
const upload = async (who: TestUser) =>
  (await request(app).post("/api/v1/images").set("Authorization", `Bearer ${who.token}`).attach("file", PNG, "shot.png")).body.data.url as string;
const post = async (who: TestUser, conversation: string, body: string, parentId?: string) =>
  (await as(who).post(`/chat/conversations/${conversation}/messages`, { body, parentId })).body.data.id as string;
const rows = async (sql: string, values: unknown[]) => (await harness.query(sql, values)).rowCount;
const inbox = async (who: TestUser) => (await as(who).get("/notifications")).body.data as Array<{ kind: string; body: string | null }>;

beforeAll(async () => {
  harness = await startDbHarness();
  const { memoryPresenceStore, setPresenceStore } = await import("../presence");
  setPresenceStore(memoryPresenceStore());
  app = (await import("../app")).app;
  (await import("../realtime")).setRealtimeServer({ to: (rooms: string[]) => ({ emit: (event: string, payload: never) => { emitted.push({ rooms, event, payload }); } }) } as never);
  head = await harness.user("denysiuk", "MANAGER", "Отдел продаж", { consent: true });
  seller = await harness.user("tymoshenko", "EMPLOYEE", "Отдел продаж", { consent: true });
  colleague = await harness.user("trubylo", "EMPLOYEE", "Отдел продаж", { consent: true });
  boss = await harness.user("nikonov", "DIRECTOR", "Руководство", { consent: true });
  channel = (await as(head).post("/chat/channels", { name: "Продажі", visibility: "PUBLIC", memberIds: [seller.id, colleague.id, boss.id] })).body.data.id;
  board = (await harness.query<{ id: string }>("SELECT id FROM task_boards WHERE department_id = $1", [head.departmentId])).rows[0]!.id;
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("deleting a chat message", () => {
  it("removes a message without replies with its reaction, mention, notification and image", async () => {
    const image = await upload(seller);
    const id = await post(seller, channel, `@trubylo глянь ![](${image}) таємний рахунок`);
    await as(head).post(`/chat/messages/${id}/reactions`, { emoji: "👍" });
    expect((await inbox(colleague)).some((item) => item.kind === "CHAT_MENTION" && item.body?.includes("таємний рахунок"))).toBe(true);
    emitted.length = 0;

    expect((await as(seller).delete(`/chat/messages/${id}`)).status).toBe(204);

    expect(await rows("SELECT 1 FROM chat_messages WHERE id = $1", [id])).toBe(0);
    expect(await rows("SELECT 1 FROM chat_message_reactions WHERE message_id = $1", [id])).toBe(0);
    expect(await rows("SELECT 1 FROM chat_mentions WHERE message_id = $1", [id])).toBe(0);
    expect((await inbox(colleague)).some((item) => item.body?.includes("таємний рахунок"))).toBe(false);
    expect((await as(head).get(image.replace("/api/v1", ""))).status).toBe(404);
    expect(await rows("SELECT 1 FROM rich_text_images WHERE id = $1", [image.split("/").at(-1)])).toBe(0);
    expect(emitted.some((item) => item.event === "chat:message-removed" && item.payload.messageId === id)).toBe(true);
    expect(emitted.some((item) => item.event === "notification:removed" && item.rooms.includes(`user:${colleague.id}`))).toBe(true);
    const shown = (await as(head).get(`/chat/conversations/${channel}/messages`)).body.data as Array<{ id: string }>;
    expect(shown.some((item) => item.id === id)).toBe(false);
  });

  it("keeps an image that is still used in a task description", async () => {
    const image = await upload(seller);
    await as(head).post("/tasks", { boardId: board, title: "Звіт", description: `<p><img src="${image}"></p>`, assigneeIds: [seller.id] });
    const id = await post(seller, channel, `![](${image})`);
    await as(seller).delete(`/chat/messages/${id}`);
    expect((await as(head).get(image.replace("/api/v1", ""))).status).toBe(200);
  });

  it("removes the collapsed direct-message notification whose preview is the deleted message", async () => {
    const dm = (await as(seller).post("/chat/direct", { userId: colleague.id })).body.data.id as string;
    await post(seller, dm, "Перше");
    const id = await post(seller, dm, "Пароль від складу");
    expect((await inbox(colleague)).filter((item) => item.kind === "CHAT_DIRECT")).toHaveLength(1);
    await as(seller).delete(`/chat/messages/${id}`);
    expect((await inbox(colleague)).filter((item) => item.kind === "CHAT_DIRECT")).toHaveLength(0);
  });

  it("keeps a contentless anchor for a message with replies, and removes it with its last reply", async () => {
    const root = await post(seller, channel, "Питання по відвантаженню");
    await as(head).post(`/chat/messages/${root}/reactions`, { emoji: "👀" });
    const reply = await post(colleague, channel, "Відповідь колеги", root);

    await as(seller).delete(`/chat/messages/${root}`);
    const anchor = (await harness.query<{ body: string; deleted_at: Date | null }>("SELECT body, deleted_at FROM chat_messages WHERE id = $1", [root])).rows[0]!;
    expect(anchor.body).toBe("");
    expect(anchor.deleted_at).not.toBeNull();
    expect(await rows("SELECT 1 FROM chat_message_reactions WHERE message_id = $1", [root])).toBe(0);
    const thread = (await as(head).get(`/chat/messages/${root}/replies`)).body.data as { root: { body: string | null; deletedAt: string | null }; replies: Array<{ id: string }> };
    expect(thread.root).toMatchObject({ body: null });
    expect(thread.replies.map((item) => item.id)).toEqual([reply]);

    await as(colleague).delete(`/chat/messages/${reply}`);
    expect(await rows("SELECT 1 FROM chat_messages WHERE id = ANY($1::uuid[])", [[root, reply]])).toBe(0);
  });

  it("counts only remaining replies after a reply is deleted", async () => {
    const root = await post(head, channel, "Хто завтра на зміні?");
    const first = await post(seller, channel, "Я", root);
    await post(colleague, channel, "І я", root);
    await as(seller).delete(`/chat/messages/${first}`);
    const shown = (await as(head).get(`/chat/conversations/${channel}/messages`)).body.data as Array<{ id: string; replyCount: number }>;
    expect(shown.find((item) => item.id === root)?.replyCount).toBe(1);
  });

  it("still audits a director's moderation with ids only", async () => {
    const id = await post(seller, channel, "Неприйнятний текст 4471");
    expect((await as(boss).delete(`/chat/messages/${id}`)).status).toBe(204);
    const audit = (await harness.query<{ metadata: unknown }>("SELECT metadata FROM audit_logs WHERE action = 'CHAT_MESSAGE_MODERATED' ORDER BY created_at DESC LIMIT 1")).rows[0]!;
    expect(audit.metadata).toEqual({ messageId: id, authorId: seller.id });
    expect(JSON.stringify(audit.metadata)).not.toContain("Неприйнятний текст 4471");
  });

  it("lets only the author or a channel moderator delete", async () => {
    const id = await post(seller, channel, "Моє");
    expect((await as(colleague).delete(`/chat/messages/${id}`)).status).toBe(403);
    expect(await rows("SELECT 1 FROM chat_messages WHERE id = $1", [id])).toBe(1);
  });
});

describe("migration 022", () => {
  it("erases messages deleted before the change, keeping anchors of threads with replies", async () => {
    const lone = await post(seller, channel, "Старе видалене");
    const anchored = await post(seller, channel, "Старе з відповіддю");
    const kept = await post(colleague, channel, "Відповідь лишається", anchored);
    const gone = await post(head, channel, "Видалена відповідь", anchored);
    await as(head).post(`/chat/messages/${anchored}/reactions`, { emoji: "👍" });
    // Deletions as the earlier version stored them: text cleared, row kept.
    await harness.query("UPDATE chat_messages SET body = '', deleted_at = now() WHERE id = ANY($1::uuid[])", [[lone, anchored, gone]]);

    const { readFile } = await import("node:fs/promises");
    await harness.query(await readFile(new URL("../../../../database/022_erase_deleted_messages.sql", import.meta.url), "utf8"));

    expect(await rows("SELECT 1 FROM chat_messages WHERE id = ANY($1::uuid[])", [[lone, gone]])).toBe(0);
    expect(await rows("SELECT 1 FROM chat_messages WHERE id = ANY($1::uuid[])", [[anchored, kept]])).toBe(2);
    expect(await rows("SELECT 1 FROM chat_message_reactions WHERE message_id = $1", [anchored])).toBe(0);
    const root = (await harness.query<{ reply_count: number }>("SELECT reply_count FROM chat_messages WHERE id = $1", [anchored])).rows[0]!;
    expect(root.reply_count).toBe(1);
  });
});
