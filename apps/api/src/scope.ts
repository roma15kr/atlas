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

export function canManageUser(auth: AuthContext, target: { id: string; company_id: string; department_id: string | null }): boolean {
  if (target.company_id !== auth.companyId) return false;
  if (auth.role === "DIRECTOR") return true;
  if (auth.role === "MANAGER") return target.department_id === auth.departmentId;
  return target.id === auth.userId;
}
