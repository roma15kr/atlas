/** The conversation list: what a direct conversation shows about the colleague. */
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let roman: TestUser, maksym: TestUser;

beforeAll(async () => {
  harness = await startDbHarness();
  const { memoryPresenceStore, setPresenceStore } = await import("../presence");
  setPresenceStore(memoryPresenceStore());
  app = (await import("../app")).app;
  roman = await harness.user("ponomarenko", "DIRECTOR", "Руководство", { consent: true });
  maksym = await harness.user("semenets", "MANAGER", "Отдел DIY", { consent: true });
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
});
