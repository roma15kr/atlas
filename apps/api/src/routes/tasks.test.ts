import { describe, expect, it, vi } from "vitest";

vi.mock("../audit", () => ({ writeAudit: vi.fn() }));
vi.mock("../db", () => ({ query: vi.fn(), transaction: vi.fn() }));

import { MAX_ASSIGNEES, nextCompletedAt, taskInput, taskPatch } from "./tasks";

const boardId = "66666666-6666-4666-8666-666666666666";
const stageId = "77777777-7777-4777-8777-777777777777";
const user = "11111111-1111-4111-8111-111111111111";

describe("task input", () => {
  it("requires a board and leaves stage and assignees to the defaults", () => {
    const parsed = taskInput.parse({ boardId, title: "Позвонить" });
    expect(parsed.stageId).toBeUndefined();
    expect(parsed.assigneeIds).toBeUndefined();
    expect(parsed.priority).toBe("NORMAL");
    expect(taskInput.safeParse({ title: "Позвонить" }).success).toBe(false);
  });

  it("deduplicates assignees and limits them", () => {
    expect(taskInput.parse({ boardId, title: "X", assigneeIds: [user, user] }).assigneeIds).toEqual([user]);
    const many = Array.from({ length: MAX_ASSIGNEES + 1 }, (_, index) => `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`);
    expect(taskInput.safeParse({ boardId, title: "X", assigneeIds: many }).success).toBe(false);
    expect(taskInput.safeParse({ boardId, title: "X", assigneeIds: [] }).success).toBe(false);
  });

  it("no longer accepts the legacy status field as a stage", () => {
    expect(taskInput.parse({ boardId, title: "X", status: "DONE" })).not.toHaveProperty("status");
  });

  it("needs a stage when moving a task to another board", () => {
    expect(taskPatch.safeParse({ boardId }).success).toBe(false);
    expect(taskPatch.safeParse({ boardId, stageId }).success).toBe(true);
    expect(taskPatch.safeParse({ stageId }).success).toBe(true);
  });
});

describe("completion timestamp", () => {
  const earlier = "2026-01-02T03:04:05.000Z";
  const now = "2026-09-30T12:00:00.000Z";

  it("stamps a task entering DONE", () => {
    expect(nextCompletedAt("ACTIVE", "DONE", null, now)).toBe(now);
    expect(nextCompletedAt("TODO", "DONE", null, now)).toBe(now);
  });

  it("clears it when a task is reopened", () => {
    expect(nextCompletedAt("DONE", "ACTIVE", earlier, now)).toBeNull();
    expect(nextCompletedAt("DONE", "TODO", earlier, now)).toBeNull();
  });

  it("keeps it for moves within DONE and within open stages", () => {
    expect(nextCompletedAt("DONE", "DONE", earlier, now)).toBe(earlier);
    expect(nextCompletedAt("TODO", "ACTIVE", null, now)).toBeNull();
  });
});
