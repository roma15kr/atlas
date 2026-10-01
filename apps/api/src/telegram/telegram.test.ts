import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ query: vi.fn(), transaction: vi.fn(), pool: {} }));
vi.mock("../audit", () => ({ writeSystemAudit: vi.fn(), writeAudit: vi.fn() }));

import { telegramAccessSql } from "../scope";
import type { AuthContext } from "../types";
import { TelegramApiError } from "./botApi";
import { parseCsv } from "./csv";
import { describeMessage, hashToken } from "./handleUpdate";

const base: AuthContext = { userId: "u1", companyId: "c1", departmentId: "d1", username: "x", role: "EMPLOYEE" };

describe("parseCsv", () => {
  it("handles a BOM, semicolons, quotes and CRLF, and skips blank lines", () => {
    expect(parseCsv("﻿telegram_id;name\r\n123;\"Иванов; Иван\"\r\n\r\n456;\"Say \"\"hi\"\"\"\r\n")).toEqual([["telegram_id", "name"], ["123", "Иванов; Иван"], ["456", "Say \"hi\""]]);
  });
  it("detects commas and keeps quoted newlines", () => {
    expect(parseCsv("telegram_id,name\n1,\"a\nb\"")).toEqual([["telegram_id", "name"], ["1", "a\nb"]]);
  });
});

describe("describeMessage", () => {
  const message = (patch: object) => ({ message_id: 1, date: 0, chat: { id: 1, type: "private" }, ...patch });
  it("keeps captions and picks the largest photo", () => {
    expect(describeMessage(message({ caption: "Чек", photo: [{ file_id: "small", file_size: 10 }, { file_id: "big", file_size: 99 }] }))).toMatchObject({ kind: "PHOTO", text: "Чек", file: { file_id: "big", mime: "image/jpeg" } });
  });
  it("summarizes stickers, locations and contacts", () => {
    expect(describeMessage(message({ sticker: { file_id: "s", emoji: "👍" } })).summary).toBe("Стикер 👍");
    expect(describeMessage(message({ location: { latitude: 50.45, longitude: 30.52 } })).summary).toBe("Геопозиция: 50.45000, 30.52000");
    expect(describeMessage(message({ contact: { phone_number: "+380501112233", first_name: "Олег" } })).summary).toBe("Контакт: Олег, +380501112233");
    expect(describeMessage(message({})).kind).toBe("OTHER");
  });
  it("uses a document's own name", () => {
    expect(describeMessage(message({ document: { file_id: "d", file_name: "Счёт.pdf", mime_type: "application/pdf" } })).file).toMatchObject({ name: "Счёт.pdf", mime: "application/pdf" });
  });
});

describe("telegramAccessSql", () => {
  it("gives directors the company, heads their department plus triage, employees their own", () => {
    expect(telegramAccessSql({ ...base, role: "DIRECTOR" }, "c")).toEqual({ sql: "c.company_id = $1", values: ["c1"] });
    expect(telegramAccessSql({ ...base, role: "MANAGER" }, "c", 2)).toEqual({ sql: "c.company_id = $2 AND (c.responsible_id IS NULL OR c.department_id = $3)", values: ["c1", "d1"] });
    expect(telegramAccessSql(base, "c")).toEqual({ sql: "c.company_id = $1 AND c.responsible_id = $2", values: ["c1", "u1"] });
  });
});

describe("Bot API errors", () => {
  it("recognizes blocked users and unknown chats", () => {
    expect(new TelegramApiError(403, "Forbidden: bot was blocked by the user").blocked).toBe(true);
    expect(new TelegramApiError(400, "Bad Request: chat not found").chatNotFound).toBe(true);
    expect(new TelegramApiError(400, "Bad Request: message is too long").chatNotFound).toBe(false);
  });
  it("never puts the token in the error message", () => {
    expect(new TelegramApiError(401, "Unauthorized").message).toBe("Telegram API 401: Unauthorized");
  });
});

describe("invite tokens", () => {
  it("are stored only as a SHA-256 hash", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("Bot API client", () => {
  afterEach(async () => { (await import("./botApi")).setTelegramFetch(null); });
  it("retries once after a 429 with retry_after", async () => {
    vi.useFakeTimers();
    Object.assign(process.env, { TELEGRAM_BOT_TOKEN: "1:test", TELEGRAM_MODE: "polling" });
    vi.resetModules();
    const api = await import("./botApi");
    const responses = [{ ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 1 } }, { ok: true, result: { message_id: 7 } }];
    const fetcher = vi.fn(async () => new Response(JSON.stringify(responses.shift())));
    api.setTelegramFetch(fetcher as unknown as typeof fetch);
    const sent = api.bot.sendMessage(5, "hi");
    await vi.advanceTimersByTimeAsync(1100);
    await expect(sent).resolves.toEqual({ message_id: 7 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_MODE;
  });
});
