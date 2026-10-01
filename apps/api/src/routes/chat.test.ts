import { describe, expect, it, vi } from "vitest";

vi.mock("../audit", () => ({ writeAudit: vi.fn() }));
vi.mock("../db", () => ({ query: vi.fn(), transaction: vi.fn() }));

import { chatPermissions, type ChatConversationRow } from "../access";
import { ApiError } from "../errors";
import { chatAccessSql } from "../scope";
import type { AuthContext } from "../types";
import { canUseChannelMention, channelCreateSchema, dmKey, groupParticipants, parseMentions } from "./chat";

const company = "22222222-2222-4222-8222-222222222222";
const base: AuthContext = { userId: "11111111-1111-4111-8111-111111111111", companyId: company, departmentId: null, username: "anna", role: "EMPLOYEE" };
const director: AuthContext = { ...base, role: "DIRECTOR" };
const row = (patch: Partial<ChatConversationRow>): ChatConversationRow => ({
  id: "c", company_id: company, kind: "CHANNEL", name: "x", description: null, visibility: "PUBLIC",
  is_default: false, archived_at: null, my_role: null, ...patch
});

describe("chatPermissions", () => {
  it("lets anyone in the company read a public channel but only members post", () => {
    expect(chatPermissions(base, row({}))).toEqual({ canSee: true, canRead: true, isMember: false, canManage: false });
    expect(chatPermissions(base, row({ company_id: "other" })).canSee).toBe(false);
  });

  it("hides private channels, groups and DMs from non-members, directors included", () => {
    for (const patch of [{ visibility: "PRIVATE" as const }, { kind: "GROUP" as const, visibility: null }, { kind: "DM" as const, visibility: null }]) {
      expect(chatPermissions(base, row(patch)).canSee).toBe(false);
      expect(chatPermissions(director, row(patch)).canRead).toBe(false);
    }
  });

  it("lets a director manage a private channel without reading it", () => {
    expect(chatPermissions(director, row({ visibility: "PRIVATE" }))).toEqual({ canSee: true, canRead: false, isMember: false, canManage: true });
    expect(chatPermissions(director, row({ kind: "GROUP", visibility: null })).canManage).toBe(false);
  });

  it("gives channel admins management and plain members none", () => {
    expect(chatPermissions(base, row({ visibility: "PRIVATE", my_role: "ADMIN" })).canManage).toBe(true);
    expect(chatPermissions(base, row({ visibility: "PRIVATE", my_role: "MEMBER" }))).toEqual({ canSee: true, canRead: true, isMember: true, canManage: false });
    expect(chatPermissions({ ...base, role: "MANAGER" }, row({ my_role: "MEMBER" })).canManage).toBe(false);
  });
});

describe("chatAccessSql", () => {
  it("is the same membership-or-public rule for every role", () => {
    const employee = chatAccessSql(base, "x.conversation_id", 2);
    expect(employee.values).toEqual([company, base.userId]);
    expect(employee.sql).toContain("ac.company_id = $2");
    expect(employee.sql).toContain("am.user_id = $3");
    expect(chatAccessSql(director, "x.conversation_id", 2)).toEqual(employee);
  });
});

describe("parseMentions", () => {
  it("finds usernames and @channel but not emails", () => {
    expect(parseMentions("@petrova посмотри, и @Alex.Kim тоже. Пиши на anna@example.com")).toEqual({ usernames: ["petrova", "alex.kim"], channel: false });
    expect(parseMentions("@channel встреча в 16:00, @petrova, @petrova")).toEqual({ usernames: ["petrova"], channel: true });
    expect(parseMentions("без упоминаний @")).toEqual({ usernames: [], channel: false });
  });
});

describe("@channel permission", () => {
  it("is limited to channel admins, directors and heads in channels", () => {
    expect(canUseChannelMention(base, { kind: "CHANNEL", my_role: "MEMBER" })).toBe(false);
    expect(canUseChannelMention(base, { kind: "CHANNEL", my_role: "ADMIN" })).toBe(true);
    expect(canUseChannelMention({ ...base, role: "MANAGER" }, { kind: "CHANNEL", my_role: "MEMBER" })).toBe(true);
    expect(canUseChannelMention(director, { kind: "GROUP", my_role: "MEMBER" })).toBe(false);
  });
});

describe("groups and DMs", () => {
  const ids = Array.from({ length: 25 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
  it("counts the creator and removes duplicates", () => {
    expect(groupParticipants(base.userId, [ids[0]!, ids[1]!, ids[1]!])).toHaveLength(3);
  });
  it("rejects groups under 3 or over 20 people", () => {
    expect(() => groupParticipants(base.userId, [ids[0]!, base.userId])).toThrow(ApiError);
    const error = (() => { try { groupParticipants(base.userId, ids.slice(0, 20)); } catch (reason) { return reason as ApiError; } })();
    expect(error?.code).toBe("CHAT_MEMBER_LIMIT");
    expect(groupParticipants(base.userId, ids.slice(0, 19))).toHaveLength(20);
  });
  it("keys a DM by the sorted pair", () => {
    expect(dmKey("b", "a")).toBe(dmKey("a", "b"));
  });
});

describe("channel input", () => {
  it("requires a visibility and limits the name", () => {
    expect(channelCreateSchema.safeParse({ name: "Продажи" }).success).toBe(false);
    expect(channelCreateSchema.safeParse({ name: "x".repeat(81), visibility: "PUBLIC" }).success).toBe(false);
    expect(channelCreateSchema.parse({ name: " Продажи ", visibility: "PRIVATE" })).toMatchObject({ name: "Продажи", memberIds: [] });
  });
});
