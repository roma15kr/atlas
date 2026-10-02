import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import type { PoolClient } from "pg";
import { z } from "zod";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { query, transaction } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { disconnectUser } from "../realtime";
import type { AuthContext, Role } from "../types";
import { replaceAvatar } from "./avatars";
import { passwordSchema, resolveCreationDepartment } from "./team";

/** Editing, disabling and password resets of team members by directors and department heads. */
export const teamAdminRouter = Router();

export type AdminAction = "edit" | "disable" | "enable" | "reset-password";

export interface AdminTarget {
  id: string;
  company_id: string;
  department_id: string | null;
  role: Role;
  status: "ACTIVE" | "DISABLED";
}

/**
 * Who may administer whom: a director anyone in the company, a head only the employees of their
 * own department, an employee nobody. Out-of-scope people are reported as not found.
 */
export function adminDenial(auth: AuthContext, target: AdminTarget, action: AdminAction): ApiError | null {
  if (target.company_id !== auth.companyId) return new ApiError(404, "USER_NOT_FOUND", "User not found");
  if (auth.role === "EMPLOYEE") return new ApiError(403, "FORBIDDEN", "You do not have permission to perform this action");
  if (auth.role === "MANAGER") {
    if (target.department_id !== auth.departmentId) return new ApiError(404, "USER_NOT_FOUND", "User not found");
    if (target.role !== "EMPLOYEE") return new ApiError(403, "MANAGER_EMPLOYEE_ONLY", "Department heads manage employee accounts only");
  }
  if (target.id === auth.userId && action === "disable") return new ApiError(409, "CANNOT_DISABLE_SELF", "You cannot disable your own account");
  if (target.id === auth.userId && action === "reset-password") return new ApiError(409, "CANNOT_RESET_SELF", "Change your own password in the profile");
  return null;
}

async function loadTarget(req: Request, auth: AuthContext, action: AdminAction): Promise<AdminTarget> {
  const id = z.string().uuid().parse(req.params.id);
  const result = await query<AdminTarget>("SELECT id, company_id, department_id, role, status FROM users WHERE id = $1", [id]);
  const target = result.rows[0];
  const denial = target ? adminDenial(auth, target, action) : new ApiError(404, "USER_NOT_FOUND", "User not found");
  if (denial) {
    if (denial.status === 403) await auditDenied(req, auth, action, id, target?.department_id ?? null);
    throw denial;
  }
  return target!;
}

async function auditDenied(req: Request, auth: AuthContext, action: string, targetId: string, departmentId: string | null): Promise<void> {
  await writeAudit(req, { auth, action: "TEAM_MEMBER_ADMIN_DENIED", entityType: "user", entityId: targetId, departmentId, metadata: { action } });
}

/** Locks the company's active directors and refuses a change that would leave none. */
async function assertDirectorRemains(client: PoolClient, companyId: string, losingId: string): Promise<void> {
  const directors = await client.query<{ id: string }>(
    "SELECT id FROM users WHERE company_id = $1 AND role = 'DIRECTOR' AND status = 'ACTIVE' ORDER BY id FOR UPDATE",
    [companyId]
  );
  if (!directors.rows.some((row) => row.id !== losingId)) {
    throw new ApiError(409, "LAST_DIRECTOR", "The company must keep at least one active director");
  }
}

const memberUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(160).optional(),
  jobTitle: z.string().trim().max(160).nullable().optional(),
  specialty: z.string().trim().max(160).nullable().optional(),
  jobDescription: z.string().trim().max(20_000).nullable().optional(),
  role: z.enum(["DIRECTOR", "MANAGER", "EMPLOYEE"]).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  departmentName: z.string().trim().min(2).max(120).optional()
}).strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" })
  .refine((value) => !(value.departmentId && value.departmentName), { message: "Provide departmentId or departmentName, not both", path: ["departmentId"] });

teamAdminRouter.patch("/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const target = await loadTarget(req, auth, "edit");
  const input = memberUpdateSchema.parse(req.body);
  const placement = input.role !== undefined || input.departmentId !== undefined || input.departmentName !== undefined;
  if (placement && (auth.role !== "DIRECTOR" || target.id === auth.userId)) {
    await auditDenied(req, auth, "change-role", target.id, target.department_id);
    throw new ApiError(403, "ROLE_CHANGE_FORBIDDEN", auth.role === "DIRECTOR" ? "You cannot change your own role" : "Only a director changes roles and departments");
  }

  const changed = await transaction(async (client) => {
    const role = input.role ?? target.role;
    let departmentId = target.department_id;
    if (input.departmentId !== undefined || input.departmentName !== undefined) {
      const department = await resolveCreationDepartment(client, auth, { departmentId: input.departmentId ?? undefined, departmentName: input.departmentName });
      departmentId = department?.id ?? null;
    }
    if (role !== "DIRECTOR" && !departmentId) throw new ApiError(400, "DEPARTMENT_REQUIRED", "A department is required for managers and employees");
    if (target.role === "DIRECTOR" && role !== "DIRECTOR" && target.status === "ACTIVE") await assertDirectorRemains(client, auth.companyId, target.id);
    const text = (value: string | null | undefined) => value === undefined ? undefined : value?.trim() || null;
    await client.query(
      `UPDATE users SET
         full_name = COALESCE($1, full_name),
         job_title = CASE WHEN $2 THEN $3 ELSE job_title END,
         specialty = CASE WHEN $4 THEN $5 ELSE specialty END,
         job_description = CASE WHEN $6 THEN $7 ELSE job_description END,
         role = $8, department_id = $9
       WHERE id = $10`,
      [input.fullName ?? null, input.jobTitle !== undefined, text(input.jobTitle) ?? null, input.specialty !== undefined, text(input.specialty) ?? null,
        input.jobDescription !== undefined, text(input.jobDescription) ?? null, role, departmentId, target.id]
    );
    return { role, departmentId };
  });

  await writeAudit(req, {
    auth, action: "TEAM_MEMBER_UPDATED", entityType: "user", entityId: target.id, departmentId: changed.departmentId,
    metadata: {
      fields: Object.keys(input),
      ...(changed.role !== target.role ? { previousRole: target.role, role: changed.role } : {}),
      ...(changed.departmentId !== target.department_id ? { previousDepartmentId: target.department_id, departmentId: changed.departmentId } : {})
    }
  });
  res.json({ data: await memberSummary(target.id) });
}));

teamAdminRouter.post("/:id/disable", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const target = await loadTarget(req, auth, "disable");
  if (target.status === "ACTIVE") {
    await transaction(async (client) => {
      if (target.role === "DIRECTOR") await assertDirectorRemains(client, auth.companyId, target.id);
      await client.query("UPDATE users SET status = 'DISABLED' WHERE id = $1", [target.id]);
      await client.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [target.id]);
    });
    disconnectUser(target.id);
    await writeAudit(req, { auth, action: "TEAM_MEMBER_DISABLED", entityType: "user", entityId: target.id, departmentId: target.department_id });
  }
  res.json({ data: await memberSummary(target.id) });
}));

teamAdminRouter.post("/:id/enable", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const target = await loadTarget(req, auth, "enable");
  if (target.status === "DISABLED") {
    if (target.role !== "DIRECTOR" && !target.department_id) throw new ApiError(400, "DEPARTMENT_REQUIRED", "Assign a department before enabling this account");
    await query("UPDATE users SET status = 'ACTIVE', failed_login_count = 0, locked_until = NULL WHERE id = $1", [target.id]);
    await writeAudit(req, { auth, action: "TEAM_MEMBER_ENABLED", entityType: "user", entityId: target.id, departmentId: target.department_id });
  }
  res.json({ data: await memberSummary(target.id) });
}));

teamAdminRouter.post("/:id/reset-password", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const target = await loadTarget(req, auth, "reset-password");
  const input = z.object({ password: passwordSchema }).strict().parse(req.body);
  const passwordHash = await bcrypt.hash(input.password, 12);
  await transaction(async (client) => {
    await client.query(
      `UPDATE users SET password_hash = $1, must_change_password = true, password_changed_at = now(),
                        failed_login_count = 0, locked_until = NULL
       WHERE id = $2`,
      [passwordHash, target.id]
    );
    await client.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [target.id]);
  });
  disconnectUser(target.id);
  await writeAudit(req, { auth, action: "PASSWORD_RESET", entityType: "user", entityId: target.id, departmentId: target.department_id });
  res.json({ data: await memberSummary(target.id) });
}));

async function memberSummary(id: string): Promise<Record<string, unknown>> {
  const result = await query(
    `SELECT u.id, u.username, u.full_name AS "fullName", u.role, u.status,
            u.department_id AS "departmentId", d.name AS "departmentName",
            u.specialty, u.job_title AS "jobTitle", u.job_description AS "jobDescription",
            u.must_change_password AS "mustChangePassword"
     FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = $1`,
    [id]
  );
  return result.rows[0]!;
}

/** Removes a member's photo; the same scope as editing them. */
teamAdminRouter.delete("/:id/avatar", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const target = await loadTarget(req, auth, "edit");
  const result = await replaceAvatar({ id: target.id, companyId: target.company_id }, null);
  if (result.replaced) {
    await writeAudit(req, { auth, action: "TEAM_MEMBER_PHOTO_REMOVED", entityType: "user", entityId: target.id, departmentId: target.department_id });
  }
  res.json({ data: { avatarUrl: null } });
}));
