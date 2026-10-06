import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { query } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { pagination } from "../http";
import { feedbackLimiter } from "../middleware";
import { objectStorage } from "../storage";
import { detectImageType } from "./avatars";

/** A report arrives as multipart: a `report` JSON field and an optional `screenshot` image (3 MB at most). */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1, fieldSize: 128 * 1024 } });

const text = (max: number) => z.string().max(max);
const at = z.string().datetime();

/** The diagnostic log: only these shapes and fields are accepted, so bodies or form values can't slip in. */
export const diagnosticsSchema = z.object({
  version: text(80),
  page: text(300),
  userAgent: text(500),
  viewport: text(40),
  language: text(40),
  timeZone: text(80),
  online: z.boolean(),
  events: z.array(z.discriminatedUnion("type", [
    z.object({ at, type: z.literal("error"), message: text(300), source: text(300).optional() }).strict(),
    z.object({ at, type: z.literal("request"), method: text(10), path: text(300), status: z.number().int().min(0).max(999), ms: z.number().int().min(0).max(600_000), requestId: text(64).optional() }).strict(),
    z.object({ at, type: z.literal("route"), path: text(300) }).strict(),
    z.object({ at, type: z.literal("socket"), state: z.enum(["connect", "disconnect", "error"]) }).strict()
  ])).max(100)
}).strict();

export const DIAGNOSTICS_MAX_BYTES = 64 * 1024;

export const reportInputSchema = z.object({
  kind: z.enum(["PROBLEM", "COMPLAINT", "IDEA"]).default("PROBLEM"),
  message: z.string().trim().min(10).max(5000),
  page: z.string().trim().min(1).max(300),
  appVersion: z.string().trim().max(80).optional(),
  userAgent: z.string().trim().max(500).optional(),
  viewport: z.string().trim().max(40).optional(),
  diagnostics: diagnosticsSchema.optional()
});

const ownColumns = `f.id, f.kind, f.message, f.page, f.status, f.issue_number AS "issueNumber", f.issue_url AS "issueUrl",
  (f.screenshot_key IS NOT NULL) AS "hasScreenshot", f.created_at AS "createdAt"`;

export const feedbackRouter = Router();

feedbackRouter.post("/", feedbackLimiter, upload.single("screenshot"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  let raw: unknown;
  try { raw = JSON.parse(String(req.body?.report ?? "")); } catch { throw new ApiError(400, "VALIDATION_ERROR", "The report must be JSON"); }
  const input = reportInputSchema.parse(raw);
  const diagnostics = input.diagnostics ? JSON.stringify(input.diagnostics) : null;
  if (diagnostics && Buffer.byteLength(diagnostics) > DIAGNOSTICS_MAX_BYTES) {
    throw new ApiError(413, "DIAGNOSTICS_TOO_LARGE", "The diagnostic log is larger than 64 KB");
  }
  let screenshot: { key: string; mime: string } | null = null;
  if (req.file) {
    const mime = detectImageType(req.file.buffer);
    if (!mime) throw new ApiError(400, "UNSUPPORTED_IMAGE", "The screenshot must be a PNG, JPEG or WebP image");
    const stored = await objectStorage.put({ companyId: auth.companyId, fileName: `feedback.${mime.split("/")[1]}`, body: req.file.buffer });
    screenshot = { key: stored.key, mime };
  }
  let report: { id: string; createdAt: Date };
  try {
    report = (await query<{ id: string; createdAt: Date }>(
      `INSERT INTO feedback_reports (company_id, user_id, department_id, kind, message, page, app_version, user_agent, viewport, screenshot_key, screenshot_mime, diagnostics)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) RETURNING id, created_at AS "createdAt"`,
      [auth.companyId, auth.userId, auth.departmentId, input.kind, input.message, input.page,
        input.appVersion ?? null, input.userAgent ?? null, input.viewport ?? null, screenshot?.key ?? null, screenshot?.mime ?? null, diagnostics]
    )).rows[0]!;
  } catch (error) {
    if (screenshot) await objectStorage.delete(screenshot.key).catch(() => undefined);
    throw error;
  }
  await writeAudit(req, {
    auth, action: "FEEDBACK_SUBMITTED", entityType: "feedback_report", entityId: report.id, departmentId: auth.departmentId,
    metadata: { kind: input.kind, screenshot: Boolean(screenshot), log: Boolean(diagnostics) }
  });
  scheduleFeedbackProcessing();
  res.status(201).json({ data: { id: report.id, status: "PENDING", createdAt: report.createdAt } });
}));

feedbackRouter.get("/mine", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const page = pagination(req);
  const result = await query<Record<string, unknown> & { totalCount: number }>(
    `SELECT ${ownColumns}, count(*) OVER()::int AS "totalCount" FROM feedback_reports f
     WHERE f.company_id = $1 AND f.user_id = $2 ORDER BY f.created_at DESC LIMIT $3 OFFSET $4`,
    [auth.companyId, auth.userId, page.limit, page.offset]
  );
  res.json({ data: result.rows.map(({ totalCount: _total, ...row }) => row), meta: { ...page, total: Number(result.rows[0]?.totalCount ?? 0) } });
}));

/** The screenshot of a report: for the person who sent it, and for the company's directors. */
feedbackRouter.get("/:id/screenshot", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) throw new ApiError(404, "FEEDBACK_NOT_FOUND", "Report not found");
  const row = (await query<{ screenshot_key: string | null; screenshot_mime: string | null; user_id: string }>(
    `SELECT screenshot_key, screenshot_mime, user_id FROM feedback_reports
     WHERE id = $1 AND company_id = $2 AND (user_id = $3 OR $4 = 'DIRECTOR')`,
    [id.data, auth.companyId, auth.userId, auth.role]
  )).rows[0];
  if (!row?.screenshot_key || !row.screenshot_mime) throw new ApiError(404, "FEEDBACK_NOT_FOUND", "Report not found");
  if (row.user_id !== auth.userId) {
    await writeAudit(req, { auth, action: "FEEDBACK_VIEWED", entityType: "feedback_report", entityId: id.data, metadata: { part: "screenshot" } });
  }
  const stream = await objectStorage.get(row.screenshot_key);
  res.setHeader("Content-Type", row.screenshot_mime);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", "inline");
  stream.on("error", (error) => res.destroy(error));
  stream.pipe(res);
}));

const directorColumns = `${ownColumns}, f.user_id AS "userId", u.full_name AS "reporterName", d.name AS "departmentName",
  f.app_version AS "appVersion", f.user_agent AS "userAgent", f.viewport, f.attempts, f.last_error AS "lastError",
  f.language, f.title_en AS "titleEn", f.summary_en AS "summaryEn", f.translation_en AS "translationEn",
  f.steps_en AS "stepsEn", f.category, f.severity, f.area, f.triaged_at AS "triagedAt"`;

const requireDirector = (auth: ReturnType<typeof requireAuth>) => {
  if (auth.role !== "DIRECTOR") throw new ApiError(403, "FORBIDDEN", "Only directors can see everyone's reports");
};

/** All reports of the company, newest first; directors only. */
feedbackRouter.get("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  requireDirector(auth);
  const filters = z.object({ status: z.enum(["PENDING", "PROCESSING", "ISSUE_CREATED", "FAILED"]).optional() }).parse(req.query);
  const page = pagination(req);
  const values: unknown[] = [auth.companyId];
  let where = "f.company_id = $1";
  if (filters.status) { values.push(filters.status); where += ` AND f.status = $${values.length}`; }
  values.push(page.limit, page.offset);
  const result = await query<Record<string, unknown> & { totalCount: number }>(
    `SELECT ${directorColumns}, count(*) OVER()::int AS "totalCount"
     FROM feedback_reports f JOIN users u ON u.id = f.user_id LEFT JOIN departments d ON d.id = f.department_id
     WHERE ${where} ORDER BY f.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  res.json({ data: result.rows.map(({ totalCount: _total, ...row }) => row), meta: { ...page, total: Number(result.rows[0]?.totalCount ?? 0) } });
}));

/** One report: the director sees everything (the view is audited); the reporter their own, without the log. */
feedbackRouter.get("/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) throw new ApiError(404, "FEEDBACK_NOT_FOUND", "Report not found");
  const row = (await query<Record<string, unknown> & { userId: string }>(
    `SELECT ${directorColumns}, f.diagnostics FROM feedback_reports f JOIN users u ON u.id = f.user_id LEFT JOIN departments d ON d.id = f.department_id
     WHERE f.id = $1 AND f.company_id = $2 AND (f.user_id = $3 OR $4 = 'DIRECTOR')`,
    [id.data, auth.companyId, auth.userId, auth.role]
  )).rows[0];
  if (!row) throw new ApiError(404, "FEEDBACK_NOT_FOUND", "Report not found");
  if (row.userId !== auth.userId) {
    await writeAudit(req, { auth, action: "FEEDBACK_VIEWED", entityType: "feedback_report", entityId: id.data, metadata: { part: "report" } });
    res.json({ data: row });
    return;
  }
  const { diagnostics: _log, ...own } = row;
  res.json({ data: own });
}));

/** Sends a failed report through processing again; directors only. */
feedbackRouter.post("/:id/retry", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  requireDirector(auth);
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) throw new ApiError(404, "FEEDBACK_NOT_FOUND", "Report not found");
  const result = await query<{ id: string }>(
    `UPDATE feedback_reports SET status = 'PENDING', attempts = 0, next_attempt_at = NULL, last_error = NULL
     WHERE id = $1 AND company_id = $2 AND status IN ('FAILED', 'PENDING') AND issue_number IS NULL RETURNING id`,
    [id.data, auth.companyId]
  );
  if (!result.rows[0]) {
    const exists = (await query("SELECT 1 FROM feedback_reports WHERE id = $1 AND company_id = $2", [id.data, auth.companyId])).rowCount;
    if (!exists) throw new ApiError(404, "FEEDBACK_NOT_FOUND", "Report not found");
    throw new ApiError(409, "FEEDBACK_NOT_RETRYABLE", "Only reports that failed or are still waiting can be retried");
  }
  await writeAudit(req, { auth, action: "FEEDBACK_RETRIED", entityType: "feedback_report", entityId: id.data });
  scheduleFeedbackProcessing();
  res.json({ data: { id: id.data, status: "PENDING" } });
}));

/**
 * Starts processing right after a submit or retry instead of waiting for the next automation tick.
 * The server sets it at start-up; tests leave it inert and call the step themselves.
 */
let scheduleFeedbackProcessing: () => void = () => undefined;
export function setFeedbackProcessor(run: () => void): void {
  scheduleFeedbackProcessing = run;
}
