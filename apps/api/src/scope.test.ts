import { describe, expect, it } from "vitest";
import { canManageUser, recordScope } from "./scope";
import type { AuthContext } from "./types";

const base: AuthContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  companyId: "22222222-2222-4222-8222-222222222222",
  departmentId: "33333333-3333-4333-8333-333333333333",
  username: "employee",
  role: "EMPLOYEE"
};

describe("recordScope", () => {
  it("limits employees to company and owner", () => {
    expect(recordScope(base)).toEqual({
      sql: "company_id = $1 AND owner_id = $2",
      values: [base.companyId, base.userId]
    });
  });

  it("limits managers to their department", () => {
    const manager = { ...base, role: "MANAGER" as const };
    expect(recordScope(manager, {}, 3)).toEqual({
      sql: "company_id = $3 AND department_id IS NOT DISTINCT FROM $4",
      values: [base.companyId, base.departmentId]
    });
  });

  it("limits directors only by company", () => {
    expect(recordScope({ ...base, role: "DIRECTOR" })).toEqual({
      sql: "company_id = $1",
      values: [base.companyId]
    });
  });
});

describe("canManageUser", () => {
  it("does not cross company boundaries", () => {
    expect(canManageUser({ ...base, role: "DIRECTOR" }, {
      id: base.userId,
      company_id: "44444444-4444-4444-8444-444444444444",
      department_id: base.departmentId
    })).toBe(false);
  });

  it("keeps managers inside their department", () => {
    const manager = { ...base, role: "MANAGER" as const };
    expect(canManageUser(manager, { id: "x", company_id: base.companyId, department_id: base.departmentId })).toBe(true);
    expect(canManageUser(manager, { id: "x", company_id: base.companyId, department_id: null })).toBe(false);
  });
});
