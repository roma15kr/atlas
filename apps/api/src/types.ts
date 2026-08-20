export const ROLES = ["DIRECTOR", "MANAGER", "EMPLOYEE"] as const;
export type Role = (typeof ROLES)[number];

export interface AuthContext {
  userId: string;
  companyId: string;
  departmentId: string | null;
  username: string;
  role: Role;
}

export interface AccessTokenPayload {
  sub: string;
  companyId: string;
  departmentId: string | null;
  username: string;
  role: Role;
  type: "access";
}

export interface ScopeSql {
  sql: string;
  values: unknown[];
}
