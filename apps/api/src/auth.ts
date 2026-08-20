import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import { z } from "zod";
import { config } from "./config";
import { query } from "./db";
import { ApiError } from "./errors";
import type { AccessTokenPayload, AuthContext, Role } from "./types";

export const REFRESH_COOKIE = "atlas_refresh";

const accessPayloadSchema = z.object({
  sub: z.string().uuid(),
  companyId: z.string().uuid(),
  departmentId: z.string().uuid().nullable(),
  username: z.string().min(1).max(100),
  role: z.enum(["DIRECTOR", "MANAGER", "EMPLOYEE"]),
  type: z.literal("access")
});

export function signAccessToken(auth: AuthContext): string {
  const payload: Omit<AccessTokenPayload, "sub"> = {
    companyId: auth.companyId,
    departmentId: auth.departmentId,
    username: auth.username,
    role: auth.role,
    type: "access"
  };
  return jwt.sign(payload, config.JWT_SECRET, {
    subject: auth.userId,
    expiresIn: config.ACCESS_TOKEN_TTL as SignOptions["expiresIn"],
    issuer: "atlas-api",
    audience: "atlas-web"
  });
}

export function verifyAccessToken(token: string): AuthContext {
  try {
    const raw = jwt.verify(token, config.JWT_SECRET, {
      issuer: "atlas-api",
      audience: "atlas-web"
    });
    const decoded = accessPayloadSchema.parse(raw) as AccessTokenPayload;
    if (decoded.role === "MANAGER" && !decoded.departmentId) throw new Error("Manager has no department");
    return {
      userId: decoded.sub,
      companyId: decoded.companyId,
      departmentId: decoded.departmentId,
      username: decoded.username,
      role: decoded.role
    };
  } catch {
    throw new ApiError(401, "INVALID_ACCESS_TOKEN", "Access token is invalid or expired");
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const value = req.header("authorization");
  if (!value?.startsWith("Bearer ")) {
    next(new ApiError(401, "AUTH_REQUIRED", "Authentication required"));
    return;
  }
  try {
    const tokenAuth = verifyAccessToken(value.slice(7));
    const current = await query<{
      id: string; company_id: string; department_id: string | null; username: string; role: Role;
    }>(
      `SELECT id, company_id, department_id, username, role
       FROM users WHERE id = $1 AND company_id = $2 AND status = 'ACTIVE'`,
      [tokenAuth.userId, tokenAuth.companyId]
    );
    const user = current.rows[0];
    if (!user || (user.role === "MANAGER" && !user.department_id)) {
      throw new ApiError(401, "ACCOUNT_UNAVAILABLE", "Account is no longer available");
    }
    req.auth = {
      userId: user.id,
      companyId: user.company_id,
      departmentId: user.department_id,
      username: user.username,
      role: user.role
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRoles(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new ApiError(401, "AUTH_REQUIRED", "Authentication required"));
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(new ApiError(403, "FORBIDDEN", "You do not have permission to perform this action"));
      return;
    }
    next();
  };
}

export function requireAuth(req: Request): AuthContext {
  if (!req.auth) throw new ApiError(401, "AUTH_REQUIRED", "Authentication required");
  return req.auth;
}

export function newRefreshToken(): { raw: string; hash: string; familyId: string; expiresAt: Date } {
  const raw = randomBytes(48).toString("base64url");
  return {
    raw,
    hash: hashRefreshToken(raw),
    familyId: randomUUID(),
    expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_DAYS * 86_400_000)
  };
}

export function hashRefreshToken(raw: string): string {
  return createHmac("sha256", config.REFRESH_TOKEN_SECRET).update(raw).digest("hex");
}

export function setRefreshCookie(res: Response, raw: string): void {
  res.cookie(REFRESH_COOKIE, raw, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    path: "/api/v1/auth",
    maxAge: config.REFRESH_TOKEN_DAYS * 86_400_000
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    path: "/api/v1/auth"
  });
}
