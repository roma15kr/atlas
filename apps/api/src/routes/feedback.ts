import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { query } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { pagination } from "../http";
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

feedbackRouter.post("/", upload.single("screenshot"), asyncHandler(async (req, res) => {
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
