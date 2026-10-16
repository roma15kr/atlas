/** Reactions on chat messages: who may react, what is accepted, and that members see the change live. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let head: TestUser, seller: TestUser, colleague: TestUser, outsider: TestUser;
let channel: string, message: string;
const emitted: Array<{ rooms: string[]; event: string; payload: { messageId: string; reactions: Array<{ emoji: string; count: number }> } }> = [];

const as = (who: TestUser) => ({
  post: (path: string, body: object = {}) => request(app).post(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body),
  delete: (path: string) => request(app).delete(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`),
  get: (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`)
});
const react = (who: TestUser, emoji: string, id = message) => as(who).post(`/chat/messages/${id}/reactions`, { emoji });
const unreact = (who: TestUser, emoji: string, id = message) => as(who).delete(`/chat/messages/${id}/reactions/${encodeURIComponent(emoji)}`);

beforeAll(async () => {
  harness = await startDbHarness();
  const { memoryPresenceStore, setPresenceStore } = await import("../presence");
  setPresenceStore(memoryPresenceStore());
  app = (await import("../app")).app;
  // A stand-in socket server that records what would reach browsers.
  (await import("../realtime")).setRealtimeServer({ to: (rooms: string[]) => ({ emit: (event: string, payload: never) => { emitted.push({ rooms, event, payload }); } }) } as never);
  head = await harness.user("denysiuk", "MANAGER", "Отдел продаж", { consent: true });
  seller = await harness.user("tymoshenko", "EMPLOYEE", "Отдел продаж", { consent: true });
  colleague = await harness.user("trubylo", "EMPLOYEE", "Отдел продаж", { consent: true });
  outsider = await harness.user("kosian", "EMPLOYEE", "Склад", { consent: true });
  channel = (await as(head).post("/chat/channels", { name: "Продажі", visibility: "PUBLIC", memberIds: [seller.id] })).body.data.id;
  message = (await as(head).post(`/chat/conversations/${channel}/messages`, { body: "План на тиждень у файлі" })).body.data.id;
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("chat reactions", () => {
  it("keeps the API's and the web's emoji lists identical", () => {
    const api = readFileSync(resolve(__dirname, "../reactions/emoji.json"), "utf8");
    const web = readFileSync(resolve(__dirname, "../../../web/src/lib/emoji.json"), "utf8");
    expect(web).toBe(api);
  });

  it("adds and removes a member's reaction, with counts and names, and tells the members", async () => {
    const added = await react(seller, "👍");
    expect(added.status).toBe(200);
    expect(added.body.data).toEqual([{ emoji: "👍", count: 1, users: [{ id: seller.id, fullName: expect.any(String) }] }]);
    expect((await react(seller, "👍")).body.data[0].count).toBe(1);
    await react(head, "👍");
    await react(head, "🔥");
    const shown = (await as(seller).get(`/chat/conversations/${channel}/messages`)).body.data.find((item: { id: string }) => item.id === message);
    expect(shown.reactions.map((item: { emoji: string; count: number }) => `${item.emoji}${item.count}`)).toEqual(["👍2", "🔥1"]);
    const live = emitted.filter((item) => item.event === "chat:reactions").at(-1)!;
    expect(live.rooms.sort()).toEqual([`user:${head.id}`, `user:${seller.id}`].sort());
    expect(live.payload).toMatchObject({ messageId: message, reactions: [{ emoji: "👍", count: 2 }, { emoji: "🔥", count: 1 }] });

    expect((await unreact(seller, "👍")).body.data[0]).toMatchObject({ emoji: "👍", count: 1 });
    expect((await unreact(seller, "👍")).status).toBe(200);
  });

  it("accepts only the picker's emoji and at most 20 different ones", async () => {
    expect((await react(seller, "привет")).status).toBe(400);
    expect((await react(seller, "👍🏿")).status).toBe(400);
    const emoji = ["😀", "😃", "😄", "😁", "😅", "🤣", "🙂", "😉", "😊", "😍", "🥰", "😘", "😎", "🤩", "🤔", "🧐", "🤨", "😐"];
    for (const item of emoji) expect((await react(seller, item)).status).toBe(200);
    const limited = await react(seller, "🚀");
    expect(limited.status).toBe(409);
    expect(limited.body.error.code).toBe("REACTION_LIMIT");
    // At the limit, joining an emoji that is already on the message still works.
    const joined = await react(seller, "👍");
    expect(joined.status).toBe(200);
    expect(joined.body.data.find((item: { emoji: string }) => item.emoji === "👍").count).toBe(2);
  });

  it("requires membership and an active conversation, and hides other people's chats", async () => {
    const other = (await as(head).post(`/chat/conversations/${channel}/messages`, { body: "Друге" })).body.data.id;
    const notMember = await react(colleague, "👍", other);
    expect(notMember.status).toBe(409);
    expect(notMember.body.error.code).toBe("CHAT_JOIN_REQUIRED");
    const dm = (await as(head).post("/chat/direct", { userId: seller.id })).body.data.id;
    const secret = (await as(head).post(`/chat/conversations/${dm}/messages`, { body: "Особисто" })).body.data.id;
    expect((await react(outsider, "👍", secret)).status).toBe(404);
    await harness.query("UPDATE chat_conversations SET archived_at = now() WHERE id = $1", [channel]);
    expect((await react(seller, "👍", other)).body.error.code).toBe("CONVERSATION_ARCHIVED");
  });
});
