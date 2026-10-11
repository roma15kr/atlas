/** Images for formatted text, end to end through the Express app, real migrations and local storage. */
import { startDbHarness, type TestUser } from "../test/dbHarness";

// A small limit keeps the rate-limit check cheap; production uses the default of 60 (see config.test.ts).
process.env.IMAGE_UPLOADS_PER_HOUR = "5";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let anna: TestUser, boss: TestUser;
let outsiderToken: string;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("fake-png-body")]);
const GIF = Buffer.concat([Buffer.from("GIF89a"), Buffer.from("fake-gif-body")]);
const PDF = Buffer.from("%PDF-1.7 fake");
const upload = (token: string, body: Buffer, name: string) =>
  request(app).post("/api/v1/images").set("Authorization", `Bearer ${token}`).attach("file", body, name);

beforeAll(async () => {
  harness = await startDbHarness();
  app = (await import("../app")).app;
  anna = await harness.user("anna", "EMPLOYEE", "Sales", { consent: true });
  boss = await harness.user("boss", "DIRECTOR", "Sales", { consent: true });
  const other = (await harness.query<{ id: string }>("INSERT INTO companies (name) VALUES ('Other') RETURNING id")).rows[0]!.id;
  const outsider = (await harness.query<{ id: string }>(
    "INSERT INTO users (company_id, username, password_hash, role, full_name) VALUES ($1, 'outsider', 'x', 'DIRECTOR', 'Outsider') RETURNING id", [other])).rows[0]!.id;
  const { signAccessToken } = await import("../auth");
  outsiderToken = signAccessToken({ userId: outsider, companyId: other, departmentId: null, username: "outsider", role: "DIRECTOR" });
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("rich text images", () => {
  it("uploads a PNG and serves it to the same company only", async () => {
    const created = await upload(anna.token, PNG, "screen.png");
    expect(created.status).toBe(201);
    const { id, url } = created.body.data as { id: string; url: string };
    expect(url).toBe(`/api/v1/images/${id}`);
    const served = await request(app).get(url).set("Authorization", `Bearer ${boss.token}`).buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => done(null, Buffer.concat(chunks)));
    });
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toBe("image/png");
    expect(served.headers["cache-control"]).toContain("private");
    expect(Buffer.compare(served.body as Buffer, PNG)).toBe(0);
    expect((await request(app).get(url).set("Authorization", `Bearer ${outsiderToken}`)).status).toBe(404);
    expect((await request(app).get(url)).status).toBe(401);
  });

  it("accepts GIFs and audits type and size only", async () => {
    expect((await upload(anna.token, GIF, "anim.gif")).status).toBe(201);
    const events = await harness.query<{ metadata: Record<string, unknown> }>("SELECT metadata FROM audit_logs WHERE action = 'RICH_TEXT_IMAGE_UPLOADED' ORDER BY id");
    expect(events.rows.at(-1)!.metadata).toEqual({ mime: "image/gif", size: GIF.length });
  });

  it("rejects PDFs and files over 5 MB and stores nothing", async () => {
    const before = (await harness.query("SELECT 1 FROM rich_text_images")).rows.length;
    const pdf = await upload(anna.token, PDF, "price.pdf");
    expect(pdf.status).toBe(400);
    expect(pdf.body.error.code).toBe("UNSUPPORTED_IMAGE");
    const big = await upload(anna.token, Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]), "big.png");
    expect(big.status).toBe(413);
    expect((await harness.query("SELECT 1 FROM rich_text_images")).rows.length).toBe(before);
  });

  it("limits uploads per user per hour", async () => {
    const used = (await harness.query("SELECT 1 FROM rich_text_images WHERE uploaded_by = $1", [boss.id])).rows.length;
    for (let i = used; i < 5; i++) expect((await upload(boss.token, PNG, `${i}.png`)).status).toBe(201);
    const limited = await upload(boss.token, PNG, "6.png");
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("IMAGE_RATE_LIMITED");
  });
});
