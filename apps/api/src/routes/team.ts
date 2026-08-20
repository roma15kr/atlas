import { Router } from "express";
import bcrypt from "bcryptjs";
import type { PoolClient } from "pg";
import { z } from "zod";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { query, transaction } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { presenceFor } from "../presence";
import { recordScope } from "../scope";
import type { AuthContext, Role } from "../types";

export const teamMemberInputSchema = z.object({
  username: z.string().trim().min(3).max(50)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Use letters, numbers, dots, underscores or hyphens")
    .transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(200)
    .regex(/[a-z]/, "Password must include a lowercase letter")
    .regex(/[A-Z]/, "Password must include an uppercase letter")
    .regex(/[0-9]/, "Password must include a number")
    .regex(/[^a-zA-Z0-9]/, "Password must include a symbol"),
  role: z.enum(["DIRECTOR", "MANAGER", "EMPLOYEE"]).default("EMPLOYEE"),
  fullName: z.string().trim().min(2).max(160),
  departmentId: z.string().uuid().nullable().optional(),
  departmentName: z.string().trim().min(2).max(120).optional(),
  specialty: z.string().trim().max(160).nullable().optional(),
  jobTitle: z.string().trim().max(160).nullable().optional(),
  jobDescription: z.string().trim().max(20_000).nullable().optional()
}).refine((value) => !(value.departmentId && value.departmentName), {
  message: "Provide departmentId or departmentName, not both",
  path: ["departmentId"]
});

export type TeamMemberInput = z.infer<typeof teamMemberInputSchema>;

export const teamRouter = Router();

teamRouter.post("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const input = teamMemberInputSchema.parse(req.body);
  assertTeamCreationPolicy(auth, input);
  const passwordHash = await bcrypt.hash(input.password, 12);

  let created: {
    id: string; username: string; fullName: string; role: Role; departmentId: string | null;
    departmentName: string | null; specialty: string | null; jobTitle: string | null;
    jobDescription: string | null; monitoringConsentAt: null; monitoringConsentVersion: null;
  };
  try {
    created = await transaction(async (client) => {
      const department = await resolveCreationDepartment(client, auth, input);
      const result = await client.query<{
        id: string; username: string; fullName: string; role: Role; specialty: string | null;
        jobTitle: string | null; jobDescription: string | null;
      }>(
        `INSERT INTO users
          (company_id, department_id, username, password_hash, role, status, full_name,
           specialty, job_title, job_description)
         VALUES ($1,$2,$3,$4,$5,'ACTIVE',$6,$7,$8,$9)
         RETURNING id, username, full_name AS "fullName", role, specialty,
                   job_title AS "jobTitle", job_description AS "jobDescription"`,
        [auth.companyId, department?.id ?? null, input.username, passwordHash, input.role, input.fullName,
          input.specialty ?? null, input.jobTitle ?? null, input.jobDescription ?? null]
      );
      return {
        ...result.rows[0]!,
        departmentId: department?.id ?? null,
        departmentName: department?.name ?? null,
        monitoringConsentAt: null,
        monitoringConsentVersion: null
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(409, "USERNAME_TAKEN", "This username is already in use");
    }
    throw error;
  }

  await writeAudit(req, {
    auth,
    action: "TEAM_MEMBER_CREATED",
    entityType: "user",
    entityId: created.id,
    departmentId: created.departmentId,
    metadata: { role: created.role, departmentId: created.departmentId }
  });
  res.status(201).json({
    data: {
      ...created,
      rating: 0,
      kpis: [],
      presence: { userId: created.id, status: "OFFLINE", online: false, lastSeenAt: null, lastSeen: null }
    }
  });
}));

teamRouter.get("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const scope = recordScope(auth, { company: "u.company_id", department: "u.department_id", owner: "u.id" });
  const users = await query<{
    id: string; username: string; fullName: string; role: string; departmentId: string | null;
    departmentName: string | null; specialty: string | null; jobTitle: string | null;
    monitoringConsentAt: Date | null; monitoringConsentVersion: string | null; rating: number; kpis: unknown[];
  }>(
    `SELECT u.id, u.username, u.full_name AS "fullName", u.role,
            u.department_id AS "departmentId", d.name AS "departmentName",
            u.specialty, u.job_title AS "jobTitle",
            u.job_description AS "jobDescription",
            u.monitoring_consent_at AS "monitoringConsentAt",
            u.monitoring_consent_version AS "monitoringConsentVersion",
            COALESCE((
              SELECT round(sum(LEAST(k.actual / NULLIF(k.target,0),1.2) * k.weight) / NULLIF(sum(k.weight),0) * 100)::int
              FROM kpis k WHERE k.user_id=u.id
            ), 0) AS rating,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id',k.id,'name',k.name,'target',k.target::float8,'actual',k.actual::float8,
                'unit',k.unit,'weight',k.weight::float8,'dueAt',k.due_at
              ) ORDER BY k.due_at NULLS LAST, k.name) FROM kpis k WHERE k.user_id=u.id
            ), '[]'::jsonb) AS kpis
     FROM users u LEFT JOIN departments d ON d.id = u.department_id
     WHERE ${scope.sql} AND u.status = 'ACTIVE' ORDER BY u.full_name`,
    scope.values
  );
  const presence = await presenceFor(users.rows.map((user) => user.id));
  res.json({ data: users.rows.map((user) => ({
    ...user,
    presence: presence[user.id] ?? { userId: user.id, status: "OFFLINE", lastSeenAt: null }
  })) });
}));

teamRouter.patch("/me/consent", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const input = z.object({
    accepted: z.boolean(),
    policyVersion: z.string().trim().min(1).max(40)
  }).parse(req.body);
  const result = await query(
    `UPDATE users SET monitoring_consent_at = CASE WHEN $1 THEN now() ELSE NULL END,
                      monitoring_consent_version = CASE WHEN $1 THEN $2 ELSE NULL END
     WHERE id = $3 AND company_id = $4
     RETURNING monitoring_consent_at AS "monitoringConsentAt",
               monitoring_consent_version AS "monitoringConsentVersion"`,
    [input.accepted, input.policyVersion, auth.userId, auth.companyId]
  );
  await writeAudit(req, {
    auth,
    action: input.accepted ? "MONITORING_CONSENT_ACCEPTED" : "MONITORING_CONSENT_WITHDRAWN",
    entityType: "user",
    entityId: auth.userId,
    metadata: { policyVersion: input.policyVersion }
  });
  res.json({ data: result.rows[0] });
}));

export function assertTeamCreationPolicy(auth: AuthContext, input: TeamMemberInput): void {
  if (auth.role === "EMPLOYEE") {
    throw new ApiError(403, "FORBIDDEN", "Employees cannot create team members");
  }
  if (auth.role === "MANAGER") {
    if (!auth.departmentId) {
      throw new ApiError(403, "MANAGER_DEPARTMENT_REQUIRED", "Manager account is not assigned to a department");
    }
    if (input.role !== "EMPLOYEE") {
      throw new ApiError(403, "MANAGER_EMPLOYEE_ONLY", "Managers can create employee accounts only");
    }
    if (input.departmentName || input.departmentId && input.departmentId !== auth.departmentId) {
      throw new ApiError(403, "INVALID_DEPARTMENT", "Managers can create users only in their own department");
    }
    return;
  }
  if (input.role !== "DIRECTOR" && !input.departmentId && !input.departmentName) {
    throw new ApiError(400, "DEPARTMENT_REQUIRED", "A department is required for managers and employees");
  }
}

async function resolveCreationDepartment(
  client: PoolClient,
  auth: AuthContext,
  input: TeamMemberInput
): Promise<{ id: string; name: string } | null> {
  if (auth.role === "MANAGER") {
    const own = await client.query<{ id: string; name: string }>(
      "SELECT id, name FROM departments WHERE id=$1 AND company_id=$2",
      [auth.departmentId, auth.companyId]
    );
    if (!own.rows[0]) throw new ApiError(403, "INVALID_DEPARTMENT", "Manager department is unavailable");
    return own.rows[0];
  }
  if (input.departmentName) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `atlas-department:${auth.companyId}:${input.departmentName.toLowerCase()}`
    ]);
    const existing = await client.query<{ id: string; name: string }>(
      "SELECT id, name FROM departments WHERE company_id=$1 AND lower(name)=lower($2) LIMIT 1",
      [auth.companyId, input.departmentName]
    );
    if (existing.rows[0]) return existing.rows[0];
    const inserted = await client.query<{ id: string; name: string }>(
      "INSERT INTO departments (company_id,name) VALUES ($1,$2) RETURNING id,name",
      [auth.companyId, input.departmentName]
    );
    return inserted.rows[0]!;
  }
  if (input.departmentId) {
    const selected = await client.query<{ id: string; name: string }>(
      "SELECT id, name FROM departments WHERE id=$1 AND company_id=$2",
      [input.departmentId, auth.companyId]
    );
    if (!selected.rows[0]) throw new ApiError(400, "INVALID_DEPARTMENT", "Department does not belong to this company");
    return selected.rows[0];
  }
  return null;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}
