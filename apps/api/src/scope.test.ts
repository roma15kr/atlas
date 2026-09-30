import { describe, expect, it } from "vitest";
import { boardAccessSql, boardManageSql, boardUserAccessSql, canManageUser, funnelAccessSql, recordScope } from "./scope";
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

describe("boardAccessSql", () => {
  it("gives directors every company board", () => {
    expect(boardAccessSql({ ...base, role: "DIRECTOR" }, "t.board_id", 4)).toEqual({
      sql: "t.board_id IN (SELECT ab.id FROM task_boards ab WHERE ab.company_id = $4)",
      values: [base.companyId]
    });
  });

  it("gives others their department's boards and boards they are members of", () => {
    for (const role of ["MANAGER", "EMPLOYEE"] as const) {
      const access = boardAccessSql({ ...base, role }, "t.board_id", 2);
      expect(access.sql).toContain("ab.company_id = $2");
      expect(access.sql).toContain("ab.department_id = $3");
      expect(access.sql).toContain("am.board_id = ab.id AND am.user_id = $4");
      expect(access.values).toEqual([base.companyId, base.departmentId, base.userId]);
    }
  });

  it("does not open director boards to users without a department", () => {
    const access = boardAccessSql({ ...base, departmentId: null }, "b.id");
    // department_id = NULL is never true, so only membership remains.
    expect(access.sql).not.toContain("IS NOT DISTINCT FROM");
    expect(access.values).toEqual([base.companyId, null, base.userId]);
  });
});

describe("boardManageSql", () => {
  it("lets directors manage every company board", () => {
    expect(boardManageSql({ ...base, role: "DIRECTOR" }, "b.id", 3)).toEqual({
      sql: "b.id IN (SELECT mb.id FROM task_boards mb WHERE mb.company_id = $3)",
      values: [base.companyId]
    });
  });

  it("lets managers manage only their department's boards", () => {
    expect(boardManageSql({ ...base, role: "MANAGER" }, "b.id", 2)).toEqual({
      sql: "b.id IN (SELECT mb.id FROM task_boards mb WHERE mb.company_id = $2 AND mb.department_id = $3)",
      values: [base.companyId, base.departmentId]
    });
  });

  it("gives employees and department-less managers nothing", () => {
    expect(boardManageSql(base, "b.id")).toEqual({ sql: "FALSE", values: [] });
    expect(boardManageSql({ ...base, role: "MANAGER", departmentId: null }, "b.id")).toEqual({ sql: "FALSE", values: [] });
  });
});

describe("boardUserAccessSql", () => {
  it("applies the board rule to arbitrary user and board rows", () => {
    const sql = boardUserAccessSql("u", "b");
    expect(sql).toContain("u.company_id = b.company_id AND u.status = 'ACTIVE'");
    expect(sql).toContain("u.role = 'DIRECTOR' OR u.department_id = b.department_id");
    expect(sql).toContain("um.board_id = b.id AND um.user_id = u.id");
  });
});
