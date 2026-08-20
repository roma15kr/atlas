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

export function canManageUser(auth: AuthContext, target: { id: string; company_id: string; department_id: string | null }): boolean {
  if (target.company_id !== auth.companyId) return false;
  if (auth.role === "DIRECTOR") return true;
  if (auth.role === "MANAGER") return target.department_id === auth.departmentId;
  return target.id === auth.userId;
}
