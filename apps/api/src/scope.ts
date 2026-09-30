import type { AuthContext, ScopeSql } from "./types";

export interface ScopeColumns {
  company?: string;
  department?: string;
  owner?: string;
}

export function recordScope(
  auth: AuthContext,
  columns: ScopeColumns = {},
  startIndex = 1
): ScopeSql {
  const company = columns.company ?? "company_id";
  const department = columns.department ?? "department_id";
  const owner = columns.owner ?? "owner_id";
  const values: unknown[] = [auth.companyId];
  const clauses = [`${company} = $${startIndex}`];

  if (auth.role === "MANAGER") {
    values.push(auth.departmentId);
    clauses.push(`${department} IS NOT DISTINCT FROM $${startIndex + 1}`);
  } else if (auth.role === "EMPLOYEE") {
    values.push(auth.userId);
    clauses.push(`${owner} = $${startIndex + 1}`);
  }

  return { sql: clauses.join(" AND "), values };
}

/**
 * Restricts a funnel id column to funnels the user may open: every company funnel for a
 * director, otherwise company-wide funnels plus funnels granted to the user or their department.
 * Combine with recordScope() for deals; funnel access is a gate, not a replacement for role scope.
 */
export function funnelAccessSql(auth: AuthContext, funnelColumn: string, startIndex = 1): ScopeSql {
  const funnels = `SELECT af.id FROM deal_funnels af WHERE af.company_id = $${startIndex}`;
  if (auth.role === "DIRECTOR") {
    return { sql: `${funnelColumn} IN (${funnels})`, values: [auth.companyId] };
  }
  return {
    sql: `${funnelColumn} IN (${funnels} AND (af.access_mode = 'COMPANY' OR EXISTS (
      SELECT 1 FROM deal_funnel_access ga
      WHERE ga.funnel_id = af.id AND (ga.user_id = $${startIndex + 1} OR ga.department_id = $${startIndex + 2})
    )))`,
    values: [auth.companyId, auth.userId, auth.departmentId]
  };
}

/**
 * Restricts a task board id column to boards the user may open: every company board for a
 * director, otherwise boards of the user's department plus boards they were added to.
 * Boards are shared, so task reads use this instead of recordScope().
 */
export function boardAccessSql(auth: AuthContext, boardColumn: string, startIndex = 1): ScopeSql {
  const boards = `SELECT ab.id FROM task_boards ab WHERE ab.company_id = $${startIndex}`;
  if (auth.role === "DIRECTOR") {
    return { sql: `${boardColumn} IN (${boards})`, values: [auth.companyId] };
  }
  return {
    sql: `${boardColumn} IN (${boards} AND (ab.department_id = $${startIndex + 1} OR EXISTS (
      SELECT 1 FROM task_board_members am WHERE am.board_id = ab.id AND am.user_id = $${startIndex + 2}
    )))`,
    values: [auth.companyId, auth.departmentId, auth.userId]
  };
}

/** Boards whose settings the user may change: any for a director, own department's for a manager. */
export function boardManageSql(auth: AuthContext, boardColumn: string, startIndex = 1): ScopeSql {
  const boards = `SELECT mb.id FROM task_boards mb WHERE mb.company_id = $${startIndex}`;
  if (auth.role === "DIRECTOR") return { sql: `${boardColumn} IN (${boards})`, values: [auth.companyId] };
  if (auth.role === "MANAGER" && auth.departmentId) {
    return { sql: `${boardColumn} IN (${boards} AND mb.department_id = $${startIndex + 1})`, values: [auth.companyId, auth.departmentId] };
  }
  return { sql: "FALSE", values: [] };
}

/** The same rule as boardAccessSql(), for any active user row against any board row (assignee checks). */
export function boardUserAccessSql(userAlias: string, boardAlias: string): string {
  return `(${userAlias}.company_id = ${boardAlias}.company_id AND ${userAlias}.status = 'ACTIVE' AND (
    ${userAlias}.role = 'DIRECTOR' OR ${userAlias}.department_id = ${boardAlias}.department_id OR EXISTS (
      SELECT 1 FROM task_board_members um WHERE um.board_id = ${boardAlias}.id AND um.user_id = ${userAlias}.id
    )))`;
}

export function canManageUser(auth: AuthContext, target: { id: string; company_id: string; department_id: string | null }): boolean {
  if (target.company_id !== auth.companyId) return false;
  if (auth.role === "DIRECTOR") return true;
  if (auth.role === "MANAGER") return target.department_id === auth.departmentId;
  return target.id === auth.userId;
}
