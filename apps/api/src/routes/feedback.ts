import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { query } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { pagination } from "../http";

/** A report arrives as multipart: a `report` JSON field and, from slice 2, an optional `screenshot`. */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1, fieldSize: 128 * 1024 } });

export const reportInputSchema = z.object({
  kind: z.enum(["PROBLEM", "COMPLAINT", "IDEA"]).default("PROBLEM"),
  message: z.string().trim().min(10).max(5000),
  page: z.string().trim().min(1).max(300),
  appVersion: z.string().trim().max(80).optional(),
  userAgent: z.string().trim().max(500).optional(),
  viewport: z.string().trim().max(40).optional()
});

const ownColumns = `f.id, f.kind, f.message, f.page, f.status, f.issue_number AS "issueNumber", f.issue_url AS "issueUrl",
  (f.screenshot_key IS NOT NULL) AS "hasScreenshot", f.created_at AS "createdAt"`;

export const feedbackRouter = Router();

feedbackRouter.post("/", upload.single("screenshot"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  let raw: unknown;
  try { raw = JSON.parse(String(req.body?.report ?? "")); } catch { throw new ApiError(400, "VALIDATION_ERROR", "The report must be JSON"); }
  const input = reportInputSchema.parse(raw);
  const result = await query<{ id: string; createdAt: Date }>(
    `INSERT INTO feedback_reports (company_id, user_id, department_id, kind, message, page, app_version, user_agent, viewport)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, created_at AS "createdAt"`,
    [auth.companyId, auth.userId, auth.departmentId, input.kind, input.message, input.page,
      input.appVersion ?? null, input.userAgent ?? null, input.viewport ?? null]
  );
  const report = result.rows[0]!;
  await writeAudit(req, {
    auth, action: "FEEDBACK_SUBMITTED", entityType: "feedback_report", entityId: report.id, departmentId: auth.departmentId,
    metadata: { kind: input.kind, screenshot: false, log: false }
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
