import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const writeAuditMock = vi.hoisted(() => vi.fn());
vi.mock("../audit", () => ({ writeAudit: writeAuditMock }));
vi.mock("../db", () => ({ query: vi.fn(), transaction: vi.fn() }));

import { ApiError } from "../errors";
import type { AuthContext } from "../types";
import { assertExactOrder, assertOpenStage, directorOnlyConfig, funnelCreateSchema } from "./funnels";

const auth: AuthContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  companyId: "22222222-2222-4222-8222-222222222222",
  departmentId: "33333333-3333-4333-8333-333333333333",
  username: "manager",
  role: "MANAGER"
};
const funnelId = "55555555-5555-4555-8555-555555555555";

function expectCode(action: () => void, code: string): void {
  try {
    action();
    throw new Error("Expected ApiError");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(code);
  }
}

describe("directorOnlyConfig", () => {
  beforeEach(() => writeAuditMock.mockReset().mockResolvedValue(undefined));

  it("rejects and audits a manager's configuration attempt", async () => {
    const next = vi.fn();
    directorOnlyConfig("STAGE_UPDATE")({ auth, params: { id: funnelId } } as unknown as Request, {} as Response, next as NextFunction);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
    expect(writeAuditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "FUNNEL_CONFIG_DENIED", entityId: funnelId, metadata: { operation: "STAGE_UPDATE" }
    }));
    expect((next.mock.calls[0]![0] as ApiError).code).toBe("DIRECTOR_ONLY");
  });

  it("lets a director through without auditing a denial", () => {
    const next = vi.fn();
    directorOnlyConfig("STAGE_UPDATE")({ auth: { ...auth, role: "DIRECTOR" }, params: {} } as unknown as Request, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();
    expect(writeAuditMock).not.toHaveBeenCalled();
  });
});

describe("funnel creation input", () => {
  const stage = { name: "Заявка" };

  it("defaults stages to OPEN and access to company-wide", () => {
    const parsed = funnelCreateSchema.parse({ name: "Опт", stages: [stage] });
    expect(parsed.stages[0]).toEqual({ name: "Заявка", color: "#6B7280", outcome: "OPEN" });
    expect(parsed.accessMode).toBeUndefined();
  });

  it("requires at least one stage and one OPEN stage", () => {
    expect(funnelCreateSchema.safeParse({ name: "Опт", stages: [] }).success).toBe(false);
    expect(funnelCreateSchema.safeParse({ name: "Опт", stages: [{ name: "Оплата", outcome: "WON" }] }).success).toBe(false);
  });

  it("rejects stage names that differ only by case", () => {
    expect(funnelCreateSchema.safeParse({ name: "Опт", stages: [stage, { name: "заявка" }] }).success).toBe(false);
  });
});

describe("stage order", () => {
  const ids = ["a", "b", "c"];

  it("accepts an exact permutation", () => {
    expect(() => assertExactOrder(ids, ["c", "a", "b"])).not.toThrow();
  });

  it("rejects missing, duplicated or foreign stages", () => {
    expectCode(() => assertExactOrder(ids, ["a", "b"]), "INVALID_STAGE_ORDER");
    expectCode(() => assertExactOrder(ids, ["a", "a", "b"]), "INVALID_STAGE_ORDER");
    expectCode(() => assertExactOrder(ids, ["a", "b", "x"]), "INVALID_STAGE_ORDER");
  });
});

describe("open stage guard", () => {
  it("requires a funnel to keep an OPEN stage", () => {
    expect(() => assertOpenStage(["OPEN", "WON"])).not.toThrow();
    expectCode(() => assertOpenStage(["WON", "LOST"]), "OPEN_STAGE_REQUIRED");
  });
});
