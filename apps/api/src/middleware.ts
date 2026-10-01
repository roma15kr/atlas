import type { NextFunction, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { verifyAccessToken } from "./auth";
import { ApiError } from "./errors";

export const USER_REQUEST_LIMIT = 1500;
export const ANONYMOUS_REQUEST_LIMIT = 300;

/** Signed-in people are counted separately even when a whole office shares one public IP. */
export function rateLimitKey(req: Request): string {
  const header = req.header("authorization");
  if (header?.startsWith("Bearer ")) {
    try { return `user:${verifyAccessToken(header.slice(7)).userId}`; } catch { /* fall through to the IP key */ }
  }
  return `ip:${req.ip ?? "unknown"}`;
}

export const apiLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: (req) => rateLimitKey(req).startsWith("user:") ? USER_REQUEST_LIMIT : ANONYMOUS_REQUEST_LIMIT,
  keyGenerator: rateLimitKey,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many requests" } }
});

/** A coarse ceiling per IP, so one address can't flood the API with many valid accounts. */
export const ipFloodLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 6000,
  standardHeaders: false,
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

export const chatPostLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.userId ?? req.ip ?? "unknown",
  message: { error: { code: "CHAT_RATE_LIMITED", message: "Too many messages, slow down" } }
});
