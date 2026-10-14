import type { NextFunction, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { verifyAccessToken } from "./auth";
import { config } from "./config";
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

export const LOGIN_FAILURES_PER_ACCOUNT = 12;
export const LOGIN_FAILURES_PER_IP = 60;

/** Failed logins are counted per typed username and address, so one person's typos don't block an office. */
export function loginAccountKey(req: Pick<Request, "ip" | "body">): string {
  const username: unknown = (req.body as { username?: unknown } | undefined)?.username;
  return `login:${req.ip ?? "unknown"}:${typeof username === "string" ? username.trim().toLowerCase().slice(0, 100) : ""}`;
}

const loginLimit = (limit: number, keyGenerator?: (req: Request) => string) => rateLimit({
  windowMs: 15 * 60_000,
  limit,
  ...(keyGenerator ? { keyGenerator } : {}),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: { code: "LOGIN_RATE_LIMITED", message: "Too many login attempts" } }
});

/** A ceiling per address across all usernames, against guessing many accounts from one place. */
export const loginIpLimiter = loginLimit(LOGIN_FAILURES_PER_IP);
export const loginLimiter = loginLimit(LOGIN_FAILURES_PER_ACCOUNT, loginAccountKey);

export const crmReadLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 180,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.userId ?? req.ip ?? "unknown",
  message: { error: { code: "CRM_RATE_LIMITED", message: "CRM access rate exceeded" } }
});

/** Images pasted into formatted text: `IMAGE_UPLOADS_PER_HOUR` (60) uploads an hour per user. */
export const imageUploadLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: config.IMAGE_UPLOADS_PER_HOUR,
  skipFailedRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.userId ?? req.ip ?? "unknown",
  message: { error: { code: "IMAGE_RATE_LIMITED", message: "Too many images uploaded, try again later" } }
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

/** Problem reports: 10 per person per hour; refused submissions don't count. */
export const feedbackLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 10,
  skipFailedRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.userId ?? req.ip ?? "unknown",
  message: { error: { code: "FEEDBACK_RATE_LIMITED", message: "Too many reports, try again later" } }
});
