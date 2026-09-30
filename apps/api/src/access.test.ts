import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ query: queryMock }));

import { assertOwnerFunnelAccess, canAccessFunnel, type TargetUser } from "./access";
import { ApiError } from "./errors";

const funnelId = "55555555-5555-4555-8555-555555555555";
const owner: TargetUser = {
  id: "11111111-1111-4111-8111-111111111111",
  company_id: "22222222-2222-4222-8222-222222222222",
  department_id: "33333333-3333-4333-8333-333333333333",
  role: "EMPLOYEE"
};

describe("funnel access checks", () => {
  beforeEach(() => queryMock.mockReset());

  it("evaluates the owner's grants, not the actor's", async () => {
    queryMock.mockResolvedValue({ rowCount: 1 });
    await assertOwnerFunnelAccess(owner, funnelId);
    const [sql, values] = queryMock.mock.calls[0]!;
    expect(sql).toContain("ga.user_id = $3 OR ga.department_id = $4");
    expect(values).toEqual([funnelId, owner.company_id, owner.id, owner.department_id]);
  });

  it("rejects an owner without access", async () => {
    queryMock.mockResolvedValue({ rowCount: 0 });
    const error = await assertOwnerFunnelAccess(owner, funnelId).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("OWNER_FUNNEL_ACCESS_REQUIRED");
  });

  it("checks directors against their company only", async () => {
    queryMock.mockResolvedValue({ rowCount: 1 });
    await expect(canAccessFunnel({
      userId: owner.id, companyId: owner.company_id, departmentId: null, username: "d", role: "DIRECTOR"
    }, funnelId)).resolves.toBe(true);
    expect(queryMock.mock.calls[0]![1]).toEqual([funnelId, owner.company_id]);
  });
});
