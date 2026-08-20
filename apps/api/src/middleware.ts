import type { NextFunction, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { ApiError } from "./errors";

export const apiLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 500,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many requests" } }
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: { code: "LOGIN_RATE_LIMITED", message: "Too many login attempts" } }
});

export const crmReadLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 180,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.userId ?? req.ip ?? "unknown",
  message: { error: { code: "CRM_RATE_LIMITED", message: "CRM access rate exceeded" } }
});

export function requireJson(req: Request, _res: Response, next: NextFunction): void {
  if (req.method !== "GET" && req.method !== "HEAD" && !req.is("application/json")) {
    next(new ApiError(415, "JSON_REQUIRED", "Content-Type application/json is required"));
    return;
  }
  next();
}
