import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
vi.mock("../db", () => ({ query: queryMock }));

import { ApiError } from "../errors";
import { mailKeys, needsReseal, openSecret, sealSecret } from "./crypto";
import { isPrivateAddress, resolveMailHost } from "./hosts";
import { consumeState, createState, exchangeCode } from "./oauth";
import { sanitizeMailHtml, snippetOf, withRemoteImages } from "./sanitize";
import { forwardSubject, normalizeSubject, parseMessageIds, participantsOf, replySubject } from "./threading";

const keyA = randomBytes(32).toString("base64");
const keyB = randomBytes(32).toString("base64");

describe("secret sealing", () => {
  it("round-trips and never stores plaintext", () => {
    const sealed = sealSecret("app-password-123", mailKeys(keyA));
    expect(JSON.stringify(sealed)).not.toContain("app-password");
    expect(openSecret(sealed, mailKeys(keyA))).toBe("app-password-123");
  });
  it("rejects a tampered tag", () => {
    const sealed = sealSecret("secret", mailKeys(keyA));
    const tag = Buffer.from(sealed.tag, "base64"); tag[0] = tag[0]! ^ 1;
    expect(() => openSecret({ ...sealed, tag: tag.toString("base64") }, mailKeys(keyA))).toThrow();
  });
  it("opens with the previous key during rotation and flags it for re-sealing", () => {
    const old = sealSecret("secret", mailKeys(keyA));
    const rotated = mailKeys(keyB, keyA);
    expect(openSecret(old, rotated)).toBe("secret");
    expect(needsReseal(old, rotated)).toBe(true);
    expect(() => openSecret(old, mailKeys(keyB))).toThrow();
  });
  it("refuses to seal without a key", () => {
    expect(() => sealSecret("x", [])).toThrow(ApiError);
  });
});

describe("mail host guard", () => {
  it.each(["10.0.0.5", "127.0.0.1", "169.254.169.254", "172.20.1.1", "192.168.1.10", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"])("treats %s as private", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });
  it("accepts public addresses", () => {
    expect(isPrivateAddress("142.250.27.108")).toBe(false);
    expect(isPrivateAddress("2a00:1450:4001::6d")).toBe(false);
  });
  it("rejects private hosts unless allowed, and non-mail ports", async () => {
    await expect(resolveMailHost("10.0.0.5", 993, "IMAP", false)).rejects.toMatchObject({ code: "MAIL_HOST_NOT_ALLOWED" });
    await expect(resolveMailHost("10.0.0.5", 993, "IMAP", true)).resolves.toMatchObject({ address: "10.0.0.5" });
    await expect(resolveMailHost("142.250.27.108", 22, "IMAP", false)).rejects.toMatchObject({ code: "MAIL_PORT_NOT_ALLOWED" });
    await expect(resolveMailHost("142.250.27.108", 587, "SMTP", false)).resolves.toMatchObject({ port: 587 });
  });
});

describe("mail HTML sanitizing", () => {
  it("removes scripts, handlers, forms, frames and script URLs", () => {
    const { html } = sanitizeMailHtml('<p onclick="x()">Hi<script>alert(1)</script></p><form><input></form><iframe src="https://e.com"></iframe><a href="javascript:alert(1)">x</a>');
    expect(html).not.toMatch(/script|onclick|<form|<input|<iframe|javascript:/i);
    expect(html).toContain("<p>Hi</p>");
  });
  it("defers remote images and keeps cid images", () => {
    const result = sanitizeMailHtml('<img src="https://tracker.example/p.gif"><img src="cid:logo">');
    expect(result.hasRemoteImages).toBe(true);
    expect(result.html).toContain('data-remote-src="https://tracker.example/p.gif"');
    expect(result.html).not.toMatch(/ src="https/);
    expect(result.html).toContain('src="cid:logo"');
    expect(withRemoteImages(result.html)).toContain('src="https://tracker.example/p.gif"');
  });
  it("opens links outside the app", () => {
    expect(sanitizeMailHtml('<a href="https://example.com">x</a>').html).toContain('rel="noopener noreferrer nofollow"');
  });
  it("builds a snippet from text or HTML", () => {
    expect(snippetOf(null, "<p>Привет,</p><p>мир</p>")).toBe("Привет,мир");
    expect(snippetOf("  много   пробелов ", null)).toBe("много пробелов");
  });
});

describe("threading helpers", () => {
  it("normalizes English and Russian reply prefixes", () => {
    expect(normalizeSubject("Re: Fwd: Ответ: Пересл: Счёт №5")).toBe("счёт №5");
    expect(normalizeSubject("RE[2]: Встреча")).toBe("встреча");
  });
  it("parses message ids and participants", () => {
    expect(parseMessageIds("<a@x> <b@y>\n <a@x>")).toEqual(["<a@x>", "<b@y>"]);
    expect(participantsOf("Me@Co.com", [{ address: "me@co.com" }, { address: "Client@X.com" }], [{ address: "client@x.com" }])).toEqual(["client@x.com"]);
  });
  it("prefixes once", () => {
    expect(replySubject("Re: Счёт")).toBe("Re: Счёт");
    expect(replySubject("Счёт")).toBe("Re: Счёт");
    expect(forwardSubject("Счёт")).toBe("Fwd: Счёт");
  });
});

describe("OAuth state", () => {
  beforeEach(() => queryMock.mockReset());
  it("is single-use and bound to the user and provider", async () => {
    queryMock.mockResolvedValue({ rowCount: 1 });
    const state = await createState("user-1", "GOOGLE");
    await expect(consumeState(state, "user-1", "GOOGLE")).resolves.toBeUndefined();
    await expect(consumeState(state, "user-2", "GOOGLE")).rejects.toMatchObject({ code: "MAIL_OAUTH_STATE_INVALID" });
    await expect(consumeState(state, "user-1", "MICROSOFT")).rejects.toMatchObject({ code: "MAIL_OAUTH_STATE_INVALID" });
    queryMock.mockResolvedValue({ rowCount: 0 });
    await expect(consumeState(state, "user-1", "GOOGLE")).rejects.toMatchObject({ code: "MAIL_OAUTH_STATE_INVALID" });
  });
  it("rejects a forged signature", async () => {
    queryMock.mockResolvedValue({ rowCount: 1 });
    const state = await createState("user-1", "GOOGLE");
    await expect(consumeState(state.replace(/.$/, (c) => c === "A" ? "B" : "A"), "user-1", "GOOGLE")).rejects.toMatchObject({ code: "MAIL_OAUTH_STATE_INVALID" });
  });
  it("reports an unconfigured provider", async () => {
    await expect(exchangeCode("GOOGLE", "code", vi.fn())).rejects.toMatchObject({ code: "MAIL_PROVIDER_UNAVAILABLE" });
  });
});
