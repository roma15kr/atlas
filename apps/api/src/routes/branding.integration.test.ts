/** Company branding: read by anyone (the login screen), changed only by a director, files versioned and cleaned up. */
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let boss: TestUser, head: TestUser, seller: TestUser;
const emitted: Array<{ rooms: string[]; event: string; payload: Record<string, unknown> }> = [];

const auth = (who: TestUser) => ({ Authorization: `Bearer ${who.token}` });
/** A PNG header with the given size: enough for the server's signature and IHDR checks. */
const png = (size: number) => {
  const body = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(body, 0);
  body.writeUInt32BE(13, 8); body.write("IHDR", 12, "ascii"); body.writeUInt32BE(size, 16); body.writeUInt32BE(size, 20);
  return body;
};
const SIZES = { logo: 512, icon192: 192, icon512: 512, maskable512: 512, apple180: 180, badge96: 96 } as const;
const uploadLogo = (who: TestUser, override: Partial<Record<keyof typeof SIZES, Buffer>> = {}) => {
  let call = request(app).put("/api/v1/branding/logo").set(auth(who));
  for (const [name, size] of Object.entries(SIZES)) call = call.attach(name, override[name as keyof typeof SIZES] ?? png(size), { filename: `${name}.png`, contentType: "image/png" });
  return call;
};
const audits = async (action: string) => (await harness.query<{ metadata: Record<string, unknown> }>(
  "SELECT metadata FROM audit_logs WHERE action = $1 ORDER BY created_at", [action])).rows;

beforeAll(async () => {
  harness = await startDbHarness();
  const { memoryPresenceStore, setPresenceStore } = await import("../presence");
  setPresenceStore(memoryPresenceStore());
  app = (await import("../app")).app;
  (await import("../realtime")).setRealtimeServer({ to: (rooms: string[]) => ({ emit: (event: string, payload: never) => { emitted.push({ rooms, event, payload }); } }) } as never);
  boss = await harness.user("nikonov", "DIRECTOR", "Руководство", { consent: true });
  head = await harness.user("denysiuk", "MANAGER", "Отдел продаж", { consent: true });
  seller = await harness.user("babenko", "EMPLOYEE", "Отдел продаж", { consent: true });
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("company branding", () => {
  it("gives the standard look before anything is saved, without a token", async () => {
    const response = await request(app).get("/api/v1/branding");
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ appName: "Atlas", accentColor: "#176f68", sidebarColor: "#1d2a28", logoVersion: null, files: null });
  });

  it("lets a director change the title and colours, audits the field names and tells everyone", async () => {
    emitted.length = 0;
    const response = await request(app).patch("/api/v1/branding").set(auth(boss)).send({ appName: "  RDIM Office ", accentColor: "#3949AB", sidebarColor: "#1f2540" });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ appName: "RDIM Office", accentColor: "#3949ab", sidebarColor: "#1f2540" });
    expect((await request(app).get("/api/v1/branding")).body.data.appName).toBe("RDIM Office");
    expect((await audits("BRANDING_UPDATED")).at(-1)!.metadata).toEqual({ fields: ["appName", "accentColor", "sidebarColor"] });
    const event = emitted.find((item) => item.event === "branding:changed");
    expect(event?.rooms).toEqual(expect.arrayContaining([`user:${seller.id}`, `user:${head.id}`]));
  });

  it("refuses a manager and an employee with 403 and audits the refusal", async () => {
    for (const who of [head, seller]) {
      const response = await request(app).patch("/api/v1/branding").set(auth(who)).send({ appName: "Чужа назва" });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("DIRECTOR_ONLY");
      expect((await uploadLogo(who)).status).toBe(403);
      expect((await request(app).delete("/api/v1/branding").set(auth(who))).status).toBe(403);
    }
    expect((await audits("BRANDING_CHANGE_DENIED")).length).toBeGreaterThanOrEqual(6);
    expect((await request(app).get("/api/v1/branding")).body.data.appName).toBe("RDIM Office");
  });

  it("refuses an accent too light for white text and an empty or 31-character title", async () => {
    const light = await request(app).patch("/api/v1/branding").set(auth(boss)).send({ accentColor: "#f5d90a" });
    expect(light.status).toBe(400);
    expect(light.body.error.code).toBe("BRANDING_LOW_CONTRAST");
    for (const appName of ["   ", "x".repeat(31)]) expect((await request(app).patch("/api/v1/branding").set(auth(boss)).send({ appName })).status).toBe(400);
    expect((await request(app).patch("/api/v1/branding").set(auth(boss)).send({ accentColor: "blue" })).status).toBe(400);
  });

  it("stores a logo's six PNGs, serves them by version with immutable caching, and deletes the old version's files", async () => {
    const first = await uploadLogo(boss);
    expect(first.status).toBe(200);
    const files = first.body.data.files as Record<string, string>;
    expect(Object.keys(files).sort()).toEqual(Object.keys(SIZES).sort());
    const served = await request(app).get(files.icon192!);
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toBe("image/png");
    expect(served.headers["cache-control"]).toContain("immutable");
    const keys = (await harness.query<{ logo_keys: Record<string, string> }>("SELECT logo_keys FROM company_branding")).rows[0]!.logo_keys;
    const second = await uploadLogo(boss);
    expect(second.body.data.logoVersion).not.toBe(first.body.data.logoVersion);
    expect((await request(app).get(files.icon192!)).status).toBe(404);
    const { objectStorage } = await import("../storage");
    expect(await objectStorage.get(keys.logo!).catch(() => null)).toBeNull();
    expect((await audits("BRANDING_LOGO_UPDATED")).length).toBe(2);
  });

  it("refuses a JPEG part, a wrong-sized PNG and an SVG", async () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(40)]);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    for (const bad of [{ logo: jpeg }, { icon192: png(256) }, { badge96: svg }]) {
      const response = await uploadLogo(boss, bad);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("UNSUPPORTED_IMAGE");
    }
  });

  it("serves a manifest with the company's name, theme colour and icon URLs", async () => {
    const response = await request(app).get("/api/v1/branding/manifest.webmanifest");
    expect(response.headers["content-type"]).toContain("application/manifest+json");
    const manifest = JSON.parse(response.text) as { name: string; theme_color: string; icons: Array<{ src: string; purpose: string }> };
    expect(manifest).toMatchObject({ name: "RDIM Office", theme_color: "#3949ab" });
    expect(manifest.icons.map((icon) => icon.src)).toEqual(expect.arrayContaining([expect.stringMatching(/^\/api\/v1\/branding\/files\/.+\/maskable512\.png$/)]));
  });

  it("names the company in an inactivity alert", async () => {
    const company = (await harness.query<{ company_id: string }>("SELECT company_id FROM users WHERE id = $1", [seller.id])).rows[0]!.company_id;
    await harness.query(
      `INSERT INTO alerts (company_id, department_id, user_id, severity, category, title, summary, evidence, rule, dedupe_key)
       VALUES ($1, $2, $3, 'INFO', 'PRESENCE', 'x', 'x', '{"weekdays": 4}', 'INACTIVITY', 'test:inactive')`, [company, seller.departmentId, seller.id]);
    const alert = ((await request(app).get("/api/v1/alerts").set(auth(boss))).body.data as Array<{ rule: string; title: string; summary: string }>).find((row) => row.rule === "INACTIVITY");
    expect(alert?.title).toBe("Немає активності в RDIM Office");
    expect(alert?.summary).toContain("в RDIM Office 4 робочих");
  });

  it("removes the logo, then resets to defaults and deletes the stored files", async () => {
    const removed = await request(app).delete("/api/v1/branding/logo").set(auth(boss));
    expect(removed.body.data).toMatchObject({ appName: "RDIM Office", files: null });
    await uploadLogo(boss);
    const keys = (await harness.query<{ logo_keys: Record<string, string> }>("SELECT logo_keys FROM company_branding")).rows[0]!.logo_keys;
    const reset = await request(app).delete("/api/v1/branding").set(auth(boss));
    expect(reset.body.data).toMatchObject({ appName: "Atlas", accentColor: "#176f68", files: null });
    expect((await harness.query("SELECT 1 FROM company_branding")).rowCount).toBe(0);
    const { objectStorage } = await import("../storage");
    expect(await objectStorage.get(keys.icon512!).catch(() => null)).toBeNull();
    expect((await audits("BRANDING_RESET")).length).toBe(1);
  });
});
