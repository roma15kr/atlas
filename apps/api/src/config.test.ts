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

describe("AI and GitHub configuration", () => {
  it("starts with the empty values Compose passes for unset settings", async () => {
    const config = await load({ OPENAI_API_KEY: "", GITHUB_TOKEN: "", GITHUB_REPOSITORY: "", APP_VERSION: "abc123" });
    expect(config.GITHUB_REPOSITORY).toBeUndefined();
    expect(config.AI_ANALYSIS_MODEL).toBe("gpt-6-luna");
    expect(config.FEEDBACK_MODEL).toBe("gpt-6-luna");
    expect(config.APP_VERSION).toBe("abc123");
    expect(config.IMAGE_UPLOADS_PER_HOUR).toBe(60);
    expect(config.PRESENCE_IDLE_MINUTES).toBe(15);
  });
  it("treats empty push keys as unset and refuses malformed ones", async () => {
    const config = await load({ VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "", VAPID_SUBJECT: "" });
    expect(config.VAPID_PUBLIC_KEY).toBeUndefined();
    expect(config.VAPID_SUBJECT).toBe("mailto:admin@atlas.local");
    await expect(load({ VAPID_PUBLIC_KEY: "not a key" })).rejects.toThrow(/VAPID_PUBLIC_KEY/);
    await expect(load({ VAPID_SUBJECT: "admin@rdim.ua" })).rejects.toThrow(/VAPID_SUBJECT/);
  });
  it("keeps the presence idle period between 5 and 120 minutes", async () => {
    expect((await load({ PRESENCE_IDLE_MINUTES: "30" })).PRESENCE_IDLE_MINUTES).toBe(30);
    await expect(load({ PRESENCE_IDLE_MINUTES: "2" })).rejects.toThrow(/PRESENCE_IDLE_MINUTES/);
    await expect(load({ PRESENCE_IDLE_MINUTES: "121" })).rejects.toThrow(/PRESENCE_IDLE_MINUTES/);
  });
  it("accepts owner/name and refuses anything else", async () => {
    expect((await load({ GITHUB_REPOSITORY: "roma15kr/atlas" })).GITHUB_REPOSITORY).toBe("roma15kr/atlas");
    await expect(load({ GITHUB_REPOSITORY: "https://github.com/roma15kr/atlas" })).rejects.toThrow(/GITHUB_REPOSITORY/);
  });
});
