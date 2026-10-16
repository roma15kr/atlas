/** The conversation list: what a direct conversation shows about the colleague, and channel icons. */
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let roman: TestUser, maksym: TestUser, olena: TestUser;

beforeAll(async () => {
  harness = await startDbHarness();
  const { memoryPresenceStore, setPresenceStore } = await import("../presence");
  setPresenceStore(memoryPresenceStore());
  app = (await import("../app")).app;
  roman = await harness.user("ponomarenko", "DIRECTOR", "Руководство", { consent: true });
  maksym = await harness.user("semenets", "MANAGER", "Отдел DIY", { consent: true });
  olena = await harness.user("horbatiuk", "EMPLOYEE", "Отдел DIY", { consent: true });
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("conversation list", () => {
  it("gives a direct conversation the colleague's photo", async () => {
    await harness.query("UPDATE users SET avatar_url = '/api/v1/avatars/a1' WHERE id = $1", [maksym.id]);
    const dm = (await request(app).post("/api/v1/chat/direct").set("Authorization", `Bearer ${roman.token}`).send({ userId: maksym.id })).body.data;
    const list = (await request(app).get("/api/v1/chat/conversations").set("Authorization", `Bearer ${roman.token}`)).body.data as Array<{ id: string; participants: Array<{ id: string; avatarUrl: string | null }> }>;
    const participants = list.find((item) => item.id === dm.id)!.participants;
    expect(participants.find((person) => person.id === maksym.id)?.avatarUrl).toBe("/api/v1/avatars/a1");
    expect(participants.find((person) => person.id === roman.id)?.avatarUrl).toBeNull();
  });

  describe("channel icons", () => {
    const as = (who: TestUser) => ({
      get: (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`),
      post: (path: string, body: object) => request(app).post(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body),
      patch: (path: string, body: object) => request(app).patch(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body)
    });
    const iconIn = async (who: TestUser, id: string) =>
      ((await as(who).get("/chat/conversations")).body.data as Array<{ id: string; icon: string | null }>).find((item) => item.id === id)?.icon;

    it("lets a channel admin set, recolour and clear an icon that members see", async () => {
      const channel = (await as(roman).post("/chat/channels", { name: "Маркетинг", visibility: "PUBLIC", memberIds: [maksym.id] })).body.data.id as string;
      expect(await iconIn(maksym, channel)).toBeNull();
      expect((await as(roman).patch(`/chat/channels/${channel}`, { icon: "megaphone:red" })).status).toBe(200);
      expect(await iconIn(maksym, channel)).toBe("megaphone:red");
      await as(roman).patch(`/chat/channels/${channel}`, { icon: "megaphone:teal" });
      expect(await iconIn(maksym, channel)).toBe("megaphone:teal");
      const directory = (await as(olena).get("/chat/channels")).body.data as Array<{ id: string; icon: string | null }>;
      expect(directory.find((item) => item.id === channel)?.icon).toBe("megaphone:teal");
      await as(roman).patch(`/chat/channels/${channel}`, { icon: null });
      expect(await iconIn(maksym, channel)).toBeNull();
    });

    it("rejects an icon or colour outside the library", async () => {
      const channel = (await as(roman).post("/chat/channels", { name: "Склад", visibility: "PUBLIC", memberIds: [] })).body.data.id as string;
      for (const icon of ["unicorn:red", "megaphone:gold", "megaphone", "megaphone:red:x"]) {
        const response = await as(roman).patch(`/chat/channels/${channel}`, { icon });
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe("CHAT_INVALID_ICON");
      }
    });

    it("refuses a member who is not an admin, and audits the attempt", async () => {
      const channel = (await as(roman).post("/chat/channels", { name: "Новини", visibility: "PUBLIC", memberIds: [maksym.id] })).body.data.id as string;
      const response = await as(maksym).patch(`/chat/channels/${channel}`, { icon: "truck:blue" });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("CHAT_FORBIDDEN");
      expect(await iconIn(roman, channel)).toBeNull();
      const audited = await harness.query("SELECT 1 FROM audit_logs WHERE action = 'CHAT_CHANNEL_UPDATED_DENIED' AND entity_id = $1 AND actor_id = $2", [channel, maksym.id]);
      expect(audited.rowCount).toBe(1);
    });

    it("lets the company channel get an icon", async () => {
      const general = (await harness.query<{ id: string }>("SELECT id FROM chat_conversations WHERE is_default AND company_id = $1", [harness.company])).rows[0]!.id;
      expect((await as(roman).patch(`/chat/channels/${general}`, { icon: "building:teal" })).status).toBe(200);
      expect(await iconIn(maksym, general)).toBe("building:teal");
    });
  });
});
