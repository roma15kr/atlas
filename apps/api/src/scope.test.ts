import { describe, expect, it } from "vitest";
import { canManageUser, funnelAccessSql, recordScope } from "./scope";
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

describe("funnelAccessSql", () => {
  it("limits directors only by company", () => {
    const scope = funnelAccessSql({ ...base, role: "DIRECTOR" }, "d.funnel_id");
    expect(scope.values).toEqual([base.companyId]);
    expect(scope.sql).toBe("d.funnel_id IN (SELECT af.id FROM deal_funnels af WHERE af.company_id = $1)");
  });

  it("admits other roles through company-wide funnels or user and department grants", () => {
    for (const role of ["MANAGER", "EMPLOYEE"] as const) {
      const scope = funnelAccessSql({ ...base, role }, "d.funnel_id");
      expect(scope.values).toEqual([base.companyId, base.userId, base.departmentId]);
      expect(scope.sql).toContain("af.access_mode = 'COMPANY'");
      expect(scope.sql).toContain("ga.user_id = $2 OR ga.department_id = $3");
    }
  });

  it("numbers parameters after an existing record scope", () => {
    const record = recordScope(base, { company: "d.company_id", department: "d.department_id", owner: "d.owner_id" }, 2);
    const funnel = funnelAccessSql(base, "d.funnel_id", 2 + record.values.length);
    expect(funnel.sql).toContain("af.company_id = $4");
    expect(funnel.sql).toContain("ga.user_id = $5 OR ga.department_id = $6");
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
