import { randomUUID } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import type { PoolClient } from "pg";
import { z } from "zod";
import {
  REFRESH_COOKIE, authenticate, clearRefreshCookie, hashRefreshToken, newRefreshToken,
  requireAuth, setRefreshCookie, signAccessToken
} from "../auth";
import { writeAudit } from "../audit";
import { query, transaction } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { loginLimiter } from "../middleware";
import type { AuthContext, Role } from "../types";

interface UserRow {
  id: string;
  company_id: string;
  department_id: string | null;
  department_name: string | null;
  username: string;
  password_hash: string;
  role: Role;
  status: "ACTIVE" | "DISABLED";
  full_name: string;
  specialty: string | null;
  job_title: string | null;
  job_description: string | null;
  avatar_url: string | null;
  failed_login_count: number;
  locked_until: Date | null;
  last_login_at: Date | null;
  monitoring_consent_at: Date | null;
  monitoring_consent_version: string | null;
}

const loginSchema = z.object({
  username: z.string().trim().min(2).max(100).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200)
});

export const authRouter = Router();

authRouter.post("/login", loginLimiter, asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await query<UserRow>(
    `${userSelect()} WHERE lower(u.username) = $1 ORDER BY u.created_at ASC LIMIT 2`,
    [input.username]
  );
  const user = result.rows.length === 1 ? result.rows[0] : undefined;
  const validPassword = user ? await bcrypt.compare(input.password, user.password_hash) : false;

  if (!user || user.status !== "ACTIVE" || user.locked_until && user.locked_until > new Date() || !validPassword) {
    if (user && (!user.locked_until || user.locked_until <= new Date())) {
      await query(
        `UPDATE users SET failed_login_count = failed_login_count + 1,
          locked_until = CASE WHEN failed_login_count + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
         WHERE id = $1`,
        [user.id]
      );
    }
    await writeAudit(req, {
      auth: user ? authFromUser(user) : null,
      action: "AUTH_LOGIN_DENIED",
      entityType: "user",
      entityId: user?.id ?? null,
      metadata: { username: input.username }
    });
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid username or password");
  }
  if (user.role === "MANAGER" && !user.department_id) {
    throw new ApiError(403, "MANAGER_DEPARTMENT_REQUIRED", "Manager account is not assigned to a department");
  }

  const auth = authFromUser(user);
  const refresh = newRefreshToken();
  await transaction(async (client) => {
    await client.query("UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1", [user.id]);
    await insertRefreshToken(client, user.id, refresh, req);
  });
  await writeAudit(req, { auth, action: "AUTH_LOGIN", entityType: "user", entityId: user.id });
  setRefreshCookie(res, refresh.raw);
  res.json({ data: { accessToken: signAccessToken(auth), user: await enrichedPublicUser(user) } });
}));

authRouter.post("/refresh", asyncHandler(async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!raw) throw new ApiError(401, "REFRESH_REQUIRED", "Refresh token is required");
  const tokenHash = hashRefreshToken(raw);
  const replacement = newRefreshToken();

  const refreshResult = await transaction(async (client): Promise<
    { kind: "ok"; user: UserRow } | { kind: "reuse" } | { kind: "expired" }
  > => {
    const tokenResult = await client.query<UserRow & {
      token_id: string; family_id: string; expires_at: Date; revoked_at: Date | null;
    }>(
      `SELECT ${userColumns()}, rt.id AS token_id, rt.family_id, rt.expires_at, rt.revoked_at
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE rt.token_hash = $1 FOR UPDATE OF rt`,
      [tokenHash]
    );
    const current = tokenResult.rows[0];
    if (!current) throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid");
    if (current.revoked_at) {
      await client.query("UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE family_id = $1", [current.family_id]);
      return { kind: "reuse" };
    }
    if (current.expires_at <= new Date() || current.status !== "ACTIVE") {
      await client.query("UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1", [current.token_id]);
      return { kind: "expired" };
    }
    if (current.role === "MANAGER" && !current.department_id) {
      throw new ApiError(403, "MANAGER_DEPARTMENT_REQUIRED", "Manager account is not assigned to a department");
    }

    replacement.familyId = current.family_id;
    const nextId = randomUUID();
    await client.query(
      `INSERT INTO refresh_tokens
        (id, user_id, family_id, token_hash, expires_at, created_by_ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6::inet, $7)`,
      [nextId, current.id, current.family_id, replacement.hash, replacement.expiresAt, requestIp(req), req.get("user-agent")?.slice(0, 500)]
    );
    await client.query("UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1", [current.token_id, nextId]);
    return { kind: "ok", user: current };
  });

  if (refreshResult.kind === "reuse") throw new ApiError(401, "REFRESH_REUSE_DETECTED", "Refresh token reuse detected");
  if (refreshResult.kind === "expired") throw new ApiError(401, "REFRESH_EXPIRED", "Refresh token is expired");
  const user = refreshResult.user;
  const auth = authFromUser(user);
  setRefreshCookie(res, replacement.raw);
  res.json({ data: { accessToken: signAccessToken(auth), user: await enrichedPublicUser(user) } });
}));

authRouter.post("/logout", asyncHandler(async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (raw) {
    await query("UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE token_hash = $1", [hashRefreshToken(raw)]);
  }
  clearRefreshCookie(res);
  res.status(204).send();
}));

authRouter.get("/me", authenticate, asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const userResult = await query<UserRow>(`${userSelect()} WHERE u.id = $1 AND u.company_id = $2`, [auth.userId, auth.companyId]);
  const user = userResult.rows[0];
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "User not found");
  res.json({ data: await enrichedPublicUser(user) });
}));

function userSelect(): string {
  return `SELECT ${userColumns()}
    FROM users u LEFT JOIN departments d ON d.id = u.department_id`;
}

function userColumns(): string {
  return `u.id, u.company_id, u.department_id, d.name AS department_name, u.username,
    u.password_hash, u.role, u.status, u.full_name, u.specialty, u.job_title,
    u.job_description, u.avatar_url, u.failed_login_count, u.locked_until,
    u.last_login_at, u.monitoring_consent_at, u.monitoring_consent_version`;
}

function authFromUser(user: UserRow): AuthContext {
  return {
    userId: user.id,
    companyId: user.company_id,
    departmentId: user.department_id,
    username: user.username,
    role: user.role
  };
}

function publicUser(user: UserRow): Record<string, unknown> {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    fullName: user.full_name,
    departmentId: user.department_id,
    departmentName: user.department_name,
    specialty: user.specialty,
    jobTitle: user.job_title,
    jobDescription: user.job_description,
    avatarUrl: user.avatar_url,
    lastLoginAt: user.last_login_at,
    monitoringConsentAt: user.monitoring_consent_at,
    monitoringConsentVersion: user.monitoring_consent_version
  };
}

async function enrichedPublicUser(user: UserRow): Promise<Record<string, unknown>> {
  const kpis = await query<{
    id: string; name: string; target: number; actual: number; unit: string; weight: number; dueAt: Date | null;
  }>(
    `SELECT id, name, target::float8 AS target, actual::float8 AS actual, unit,
            weight::float8 AS weight, due_at AS "dueAt"
     FROM kpis WHERE user_id = $1 ORDER BY due_at NULLS LAST, name`,
    [user.id]
  );
  const totalWeight = kpis.rows.reduce((sum, kpi) => sum + kpi.weight, 0);
  const weighted = kpis.rows.reduce((sum, kpi) => sum + Math.min(kpi.target ? kpi.actual / kpi.target : 0, 1.2) * kpi.weight, 0);
  return { ...publicUser(user), kpis: kpis.rows, rating: totalWeight ? Math.round(weighted / totalWeight * 100) : 0 };
}

async function insertRefreshToken(
  client: PoolClient,
  userId: string,
  refresh: ReturnType<typeof newRefreshToken>,
  req: Parameters<typeof requestIp>[0]
): Promise<void> {
  await client.query(
    `INSERT INTO refresh_tokens
      (user_id, family_id, token_hash, expires_at, created_by_ip, user_agent)
     VALUES ($1, $2, $3, $4, $5::inet, $6)`,
    [userId, refresh.familyId, refresh.hash, refresh.expiresAt, requestIp(req), req.get("user-agent")?.slice(0, 500)]
  );
}

function requestIp(req: { ip?: string; socket: { remoteAddress?: string }; get(name: string): string | undefined }): string | null {
  const ip = req.ip || req.socket.remoteAddress || null;
  return ip?.startsWith("::ffff:") ? ip.slice(7) : ip;
}
