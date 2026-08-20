import { query } from "./db";
import { ApiError } from "./errors";
import { canManageUser } from "./scope";
import type { AuthContext } from "./types";

export interface TargetUser {
  id: string;
  company_id: string;
  department_id: string | null;
}

export async function manageableUser(auth: AuthContext, requestedId?: string): Promise<TargetUser> {
  const id = auth.role === "EMPLOYEE" ? auth.userId : requestedId ?? auth.userId;
  const result = await query<TargetUser>(
    "SELECT id, company_id, department_id FROM users WHERE id = $1 AND status = 'ACTIVE'",
    [id]
  );
  const target = result.rows[0];
  if (!target || !canManageUser(auth, target)) {
    throw new ApiError(403, "INVALID_OWNER", "Selected user is outside your access scope");
  }
  return target;
}
