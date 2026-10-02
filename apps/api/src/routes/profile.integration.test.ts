/** Personal profile details, birthday privacy and profile photos through the Express app and a real Postgres. */
import { existsSync } from "node:fs";
import path from "node:path";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDbHarness, type TestUser } from "../test/dbHarness";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let anna: TestUser, boris: TestUser, head: TestUser, otherHead: TestUser, boss: TestUser;

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300_000, 1), Buffer.from([0xff, 0xd9])]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x1a, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(14)]);

const as = (who: TestUser) => ({
  get: (url: string) => request(app).get(`/api/v1${url}`).set("Authorization", `Bearer ${who.token}`),
  patch: (url: string, body: object) => request(app).patch(`/api/v1${url}`).set("Authorization", `Bearer ${who.token}`).send(body),
  upload: (body: Buffer, name: string, contentType: string) => request(app).post("/api/v1/team/me/avatar").set("Authorization", `Bearer ${who.token}`).attach("file", body, { filename: name, contentType }),
  delete: (url: string) => request(app).delete(`/api/v1${url}`).set("Authorization", `Bearer ${who.token}`)
});
const audits = async (action: string) => (await harness.query<{ entity_id: string; metadata: Record<string, unknown> | null }>(
  "SELECT entity_id, metadata FROM audit_logs WHERE action = $1 ORDER BY created_at", [action])).rows;
const avatarKey = async (id: string) => (await harness.query<{ avatar_key: string | null }>("SELECT avatar_key FROM users WHERE id = $1", [id])).rows[0]?.avatar_key ?? null;
const storedFile = (key: string) => path.join(process.env.STORAGE_DIR!, key);
const dateYearsAgo = (years: number, days = 0) => {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

beforeAll(async () => {
  harness = await startDbHarness();
  app = (await import("../app")).app;
  anna = await harness.user("anna", "EMPLOYEE", "Sales");
  boris = await harness.user("boris", "EMPLOYEE", "Sales");
  head = await harness.user("head", "MANAGER", "Sales");
  otherHead = await harness.user("opshead", "MANAGER", "Ops");
  boss = await harness.user("boss", "DIRECTOR", null);
}, 60_000);

afterAll(async () => harness?.stop());

describe("personal details", () => {
  it("saves and returns each field, and audits field names only", async () => {
    const response = await as(anna).patch("/team/me", { birthDate: "1994-03-12", phone: "+380 67 123-45-67", contactEmail: "anna@example.com", city: "Київ", about: "Люблю B2B" });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ birthDate: "1994-03-12", birthday: "03-12", showBirthday: true, phone: "+380 67 123-45-67", contactEmail: "anna@example.com", city: "Київ", about: "Люблю B2B" });
    const [event] = await audits("PROFILE_UPDATED");
    expect(event?.metadata).toEqual({ fields: ["birthDate", "phone", "contactEmail", "city", "about"] });
    expect(JSON.stringify(event)).not.toContain("1994");
  });

  it("clears a field with an empty string", async () => {
    const response = await as(anna).patch("/team/me", { city: "" });
    expect(response.body.data.city).toBeNull();
    expect(response.body.data.phone).toBe("+380 67 123-45-67");
  });

  it("refuses impossible birth dates, bad phones and emails, and management fields", async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    for (const body of [
      { birthDate: tomorrow }, { birthDate: "1899-12-31" }, { birthDate: "1994-02-30" }, { birthDate: dateYearsAgo(14, 1) },
      { phone: "12-34" }, { phone: "call me" }, { contactEmail: "anna@" }, { about: "x".repeat(501) }, { role: "DIRECTOR" }
    ]) {
      const response = await as(anna).patch("/team/me", body);
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect((await as(anna).patch("/team/me", { birthDate: dateYearsAgo(14) })).status).toBe(200);
    await as(anna).patch("/team/me", { birthDate: "1994-03-12" });
  });

  it("returns the details in the signed-in session", async () => {
    const me = await as(anna).get("/auth/me");
    expect(me.body.data).toMatchObject({ birthDate: "1994-03-12", birthday: "03-12", showBirthday: true, contactEmail: "anna@example.com" });
  });
});

describe("birthday privacy", () => {
  const annaFor = async (viewer: TestUser) => (await as(viewer).get("/team")).body.data.find((row: { id: string }) => row.id === anna.id);

  it("shows colleagues the day and month only", async () => {
    const row = await annaFor(head);
    expect(row).toMatchObject({ birthday: "03-12", phone: "+380 67 123-45-67", contactEmail: "anna@example.com", about: "Люблю B2B" });
    expect(row).not.toHaveProperty("birthDate");
    expect(row).not.toHaveProperty("showBirthday");
    expect(await annaFor(boss)).not.toHaveProperty("birthDate");
  });

  it("hides the birthday from colleagues when turned off, but not from the person", async () => {
    await as(anna).patch("/team/me", { showBirthday: false });
    expect(await annaFor(head)).not.toHaveProperty("birthday");
    expect(await annaFor(anna)).toMatchObject({ birthDate: "1994-03-12", birthday: "03-12", showBirthday: false });
    await as(anna).patch("/team/me", { showBirthday: true });
  });
});

describe("profile photo", () => {
  it("accepts PNG, JPEG and WebP by content and serves them without a token", async () => {
    for (const [body, type] of [[PNG, "image/png"], [WEBP, "image/webp"], [JPEG, "image/jpeg"]] as const) {
      const uploaded = await as(anna).upload(body, "photo.bin", "application/octet-stream");
      expect(uploaded.status).toBe(201);
      const url: string = uploaded.body.data.avatarUrl;
      expect(url).toMatch(/^\/api\/v1\/avatars\/[0-9a-f-]{36}$/);
      const served = await request(app).get(url);
      expect(served.status).toBe(200);
      expect(served.headers["content-type"]).toBe(type);
      expect(served.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
      expect(served.headers["x-content-type-options"]).toBe("nosniff");
      expect(Buffer.compare(served.body as Buffer, body)).toBe(0);
    }
    expect((await audits("PROFILE_PHOTO_UPDATED")).map((event) => event.metadata?.replaced)).toEqual([false, true, true]);
  });

  it("refuses a disguised file and an oversized one", async () => {
    const before = await avatarKey(anna.id);
    const disguised = await as(anna).upload(Buffer.from("<svg onload=alert(1)>"), "photo.png", "image/png");
    expect(disguised.status).toBe(400);
    expect(disguised.body.error.code).toBe("UNSUPPORTED_IMAGE");
    const huge = await as(anna).upload(Buffer.concat([JPEG, Buffer.alloc(2 * 1024 * 1024)]), "huge.jpg", "image/jpeg");
    expect(huge.status).toBe(413);
    expect(huge.body.error.code).toBe("FILE_TOO_LARGE");
    expect(await avatarKey(anna.id)).toBe(before);
  });

  it("retires the old URL and object when the photo is replaced", async () => {
    const oldKey = (await avatarKey(anna.id))!;
    const oldUrl = (await as(anna).get("/auth/me")).body.data.avatarUrl as string;
    const next = await as(anna).upload(PNG, "new.png", "image/png");
    expect((await request(app).get(oldUrl)).status).toBe(404);
    expect(existsSync(storedFile(oldKey))).toBe(false);
    expect((await request(app).get(next.body.data.avatarUrl)).status).toBe(200);
    expect((await annaFor()).avatarUrl).toBe(next.body.data.avatarUrl);
    async function annaFor() { return (await as(head).get("/team")).body.data.find((row: { id: string }) => row.id === anna.id); }
  });

  it("removes the photo and its object", async () => {
    const key = (await avatarKey(anna.id))!;
    const url = (await as(anna).get("/auth/me")).body.data.avatarUrl as string;
    const removed = await as(anna).delete("/team/me/avatar");
    expect(removed.status).toBe(200);
    expect((await as(anna).get("/auth/me")).body.data.avatarUrl).toBeNull();
    expect((await request(app).get(url)).status).toBe(404);
    expect(existsSync(storedFile(key))).toBe(false);
    expect(await audits("PROFILE_PHOTO_REMOVED")).toHaveLength(1);
    expect((await request(app).get("/api/v1/avatars/not-a-uuid")).status).toBe(404);
  });
});

describe("removing a member's photo", () => {
  it("lets a head remove an employee's photo in their department only", async () => {
    await as(boris).upload(PNG, "b.png", "image/png");
    expect((await as(anna).delete(`/team/${boris.id}/avatar`)).status).toBe(403);
    expect((await as(otherHead).delete(`/team/${boris.id}/avatar`)).status).toBe(404);
    expect(await avatarKey(boris.id)).not.toBeNull();
    expect((await as(head).delete(`/team/${boris.id}/avatar`)).status).toBe(200);
    expect(await avatarKey(boris.id)).toBeNull();
    expect((await audits("TEAM_MEMBER_PHOTO_REMOVED")).map((event) => event.entity_id)).toEqual([boris.id]);
  });
});
