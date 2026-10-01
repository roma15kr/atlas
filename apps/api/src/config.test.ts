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

describe("telegram configuration", () => {
  it("requires a webhook secret of at least 32 characters when a token is set", async () => {
    await expect(load({ TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_MODE: "webhook", TELEGRAM_WEBHOOK_SECRET: "" })).rejects.toThrow(/TELEGRAM_WEBHOOK_SECRET/);
    await expect(load({ TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_WEBHOOK_SECRET: "short" })).rejects.toThrow(/TELEGRAM_WEBHOOK_SECRET|32/);
    const config = await load({ TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_WEBHOOK_SECRET: "a".repeat(32) });
    expect(config.TELEGRAM_MODE).toBe("webhook");
  });
  it("needs no secret in polling mode or without a token", async () => {
    expect((await load({ TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_MODE: "polling", TELEGRAM_WEBHOOK_SECRET: "" })).TELEGRAM_MODE).toBe("polling");
    expect((await load({ TELEGRAM_BOT_TOKEN: "", TELEGRAM_WEBHOOK_SECRET: "" })).TELEGRAM_WEBHOOK_SECRET).toBeUndefined();
  });
});
