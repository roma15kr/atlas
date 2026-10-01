import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const original = { ...process.env };
afterEach(() => { process.env = { ...original }; vi.resetModules(); });

async function load(env: Record<string, string>) {
  process.env = { ...original, ...env };
  vi.resetModules();
  return (await import("./config")).config;
}

describe("mail configuration", () => {
  it("treats an empty key as not configured", async () => {
    const config = await load({ MAIL_ENCRYPTION_KEY: "" });
    expect(config.MAIL_ENCRYPTION_KEY).toBeUndefined();
    expect(config.MAIL_SYNC_DAYS).toBe(90);
    expect(config.MICROSOFT_TENANT_ID).toBe("common");
  });
  it("accepts a 32-byte base64 key", async () => {
    const key = randomBytes(32).toString("base64");
    expect((await load({ MAIL_ENCRYPTION_KEY: key })).MAIL_ENCRYPTION_KEY).toBe(key);
  });
  it("refuses to start with a malformed key", async () => {
    await expect(load({ MAIL_ENCRYPTION_KEY: "too-short" })).rejects.toThrow(/MAIL_ENCRYPTION_KEY|32 bytes/);
  });
});
