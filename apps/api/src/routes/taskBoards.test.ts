import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const writeAuditMock = vi.hoisted(() => vi.fn());
const queryMock = vi.hoisted(() => vi.fn());
vi.mock("../audit", () => ({ writeAudit: writeAuditMock }));
vi.mock("../db", () => ({ query: queryMock, transaction: vi.fn() }));

import { ApiError } from "../errors";
import type { AuthContext } from "../types";
import { assertStageCategories, boardCreateSchema, boardManagerOnly, canManageBoard } from "./taskBoards";

const department = "33333333-3333-4333-8333-333333333333";
const otherDepartment = "44444444-4444-4444-8444-444444444444";
const boardId = "66666666-6666-4666-8666-666666666666";
const auth: AuthContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  companyId: "22222222-2222-4222-8222-222222222222",
  departmentId: department,
  username: "employee",
  role: "EMPLOYEE"
};

async function runGuard(user: AuthContext): Promise<unknown> {
  const next = vi.fn();
  boardManagerOnly("STAGE_CREATE")({ auth: user, params: { id: boardId } } as unknown as Request, {} as Response, next as NextFunction);
  await vi.waitFor(() => expect(next).toHaveBeenCalled());
  return next.mock.calls[0]![0];
}

describe("canManageBoard", () => {
  it("lets directors manage any board and managers only their department's", () => {
    expect(canManageBoard({ ...auth, role: "DIRECTOR" }, { department_id: null })).toBe(true);
    expect(canManageBoard({ ...auth, role: "MANAGER" }, { department_id: department })).toBe(true);
    expect(canManageBoard({ ...auth, role: "MANAGER" }, { department_id: otherDepartment })).toBe(false);
    expect(canManageBoard({ ...auth, role: "MANAGER" }, { department_id: null })).toBe(false);
    expect(canManageBoard({ ...auth, role: "MANAGER", departmentId: null }, { department_id: null })).toBe(false);
    expect(canManageBoard(auth, { department_id: department })).toBe(false);
  });
});

describe("boardManagerOnly", () => {
  beforeEach(() => {
    writeAuditMock.mockReset().mockResolvedValue(undefined);
    queryMock.mockReset();
  });

  it("rejects and audits an employee with the board's department", async () => {
    queryMock.mockResolvedValue({ rows: [{ id: boardId, name: "Задачи отдела", department_id: department }] });
    const error = await runGuard(auth);
    expect((error as ApiError).code).toBe("BOARD_MANAGER_ONLY");
    expect(writeAuditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "TASK_BOARD_CONFIG_DENIED", entityId: boardId, departmentId: department, metadata: { operation: "STAGE_CREATE" }
    }));
  });

  it("rejects a manager who is only a member of another department's board", async () => {
    queryMock.mockResolvedValue({ rows: [{ id: boardId, name: "Чужая", department_id: otherDepartment }] });
    const error = await runGuard({ ...auth, role: "MANAGER" });
    expect((error as ApiError).status).toBe(403);
    expect(writeAuditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ departmentId: otherDepartment }));
  });

  it("answers 404 without auditing when the caller cannot open the board", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const error = await runGuard({ ...auth, role: "MANAGER" });
    expect((error as ApiError).code).toBe("BOARD_NOT_FOUND");
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it("lets the department head through", async () => {
    queryMock.mockResolvedValue({ rows: [{ id: boardId, name: "Задачи отдела", department_id: department }] });
    expect(await runGuard({ ...auth, role: "MANAGER" })).toBeUndefined();
    expect(writeAuditMock).not.toHaveBeenCalled();
  });
});

describe("board creation input", () => {
  const todo = { name: "Нужно сделать", category: "TODO" };
  const done = { name: "Готово", category: "DONE" };

  it("accepts a board with TODO and DONE stages and defaults colors", () => {
    const parsed = boardCreateSchema.parse({ name: "Запуск продукта", stages: [todo, done] });
    expect(parsed.stages[0]).toEqual({ name: "Нужно сделать", color: "#6B7280", category: "TODO" });
    expect(parsed.memberIds).toEqual([]);
    expect(parsed.departmentId).toBeUndefined();
  });

  it("requires stages including TODO and DONE categories", () => {
    expect(boardCreateSchema.safeParse({ name: "Б", stages: [] }).success).toBe(false);
    expect(boardCreateSchema.safeParse({ name: "Б", stages: [done] }).success).toBe(false);
    expect(boardCreateSchema.safeParse({ name: "Б", stages: [todo] }).success).toBe(false);
    expect(boardCreateSchema.safeParse({ name: "Б", stages: [{ name: "X" }, done] }).success).toBe(false);
  });

  it("rejects stage names that differ only by case and blank names", () => {
    expect(boardCreateSchema.safeParse({ name: "Б", stages: [todo, done, { name: "готово", category: "ACTIVE" }] }).success).toBe(false);
    expect(boardCreateSchema.safeParse({ name: "  ", stages: [todo, done] }).success).toBe(false);
  });
});

describe("stage categories", () => {
  it("requires a TODO and a DONE stage", () => {
    expect(() => assertStageCategories(["TODO", "ACTIVE", "DONE"])).not.toThrow();
    for (const categories of [["TODO", "ACTIVE"], ["ACTIVE", "DONE"], []] as const) {
      try {
        assertStageCategories([...categories]);
        throw new Error("Expected ApiError");
      } catch (error) {
        expect((error as ApiError).code).toBe("STAGE_CATEGORY_REQUIRED");
      }
    }
  });
});
