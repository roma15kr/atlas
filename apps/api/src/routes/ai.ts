import { Router } from "express";
import { z } from "zod";
import { manageableUser } from "../access";
import { analyzeWork } from "../ai";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { config } from "../config";
import { query } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { pagination } from "../http";
import { canManageUser } from "../scope";
import type { AuthContext } from "../types";
import { llmConfigured } from "../llm/openai";

export const aiRouter = Router();

aiRouter.get("/status", (_req, res) => {
  const configured = llmConfigured();
  res.json({ data: { configured, provider: "openai", model: config.AI_ANALYSIS_MODEL, mode: configured ? "AI_WITH_RULE_FALLBACK" : "RULES" } });
});

const analysisColumns = `a.id, a.mode, a.summary, a.recommendations, a.source, a.model,
  a.fallback_reason AS "fallbackReason", a.metrics, a.created_at AS "createdAt",
  a.subject_id AS "subjectId", a.requested_by AS "requestedById", r.full_name AS "requestedByName"`;

/**
 * Who may read a stored analysis: directors any in the company, a manager those about people of
 * their department, and nobody an analysis someone else ran about them.
 */
function analysisVisibility(auth: AuthContext, start: number): { sql: string; values: unknown[] } {
  return {
    sql: `a.company_id = $${start} AND CASE WHEN a.subject_id = $${start + 1} THEN a.requested_by = $${start + 1}
      ELSE ($${start + 2} = 'DIRECTOR' OR ($${start + 2} = 'MANAGER' AND s.department_id = $${start + 3})) END`,
    values: [auth.companyId, auth.userId, auth.role, auth.departmentId]
  };
}

aiRouter.post("/analyze", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const input = z.object({
    mode: z.enum(["ADVICE", "EVALUATION", "FORECAST"]),
    targetUserId: z.string().uuid().optional()
  }).parse(req.body);
  const target = await manageableUser(auth, input.targetUserId ?? auth.userId);
  const result = await analyzeWork(auth, target.id, input.mode);
  const stored = await query<{ id: string; createdAt: Date }>(
    `INSERT INTO ai_analyses (company_id, requested_by, subject_id, mode, summary, recommendations, source, model, fallback_reason, metrics)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb) RETURNING id, created_at AS "createdAt"`,
    [auth.companyId, auth.userId, target.id, input.mode, result.summary, JSON.stringify(result.recommendations),
      result.source, result.model ?? null, result.fallbackReason ?? null, JSON.stringify(result.metrics)]
  );
  const analysis = stored.rows[0]!;
  await writeAudit(req, {
    auth,
    action: "AI_ANALYSIS_REQUESTED",
    entityType: "user",
    entityId: target.id,
    departmentId: target.department_id,
    metadata: { analysisId: analysis.id, mode: input.mode, source: result.source, model: result.model ?? null }
  });
  res.json({ data: { ...result, id: analysis.id, mode: input.mode, createdAt: analysis.createdAt, subjectId: target.id, requestedById: auth.userId } });
}));

aiRouter.get("/analyses", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const filters = z.object({
    targetUserId: z.string().uuid().optional(),
    mode: z.enum(["ADVICE", "EVALUATION", "FORECAST"]).optional()
  }).parse(req.query);
  const subjectId = filters.targetUserId ?? auth.userId;
  const subject = (await query<{ id: string; company_id: string; department_id: string | null }>(
    "SELECT id, company_id, department_id FROM users WHERE id = $1", [subjectId])).rows[0];
  if (!subject || !canManageUser(auth, subject)) throw new ApiError(404, "USER_NOT_FOUND", "User not found");
  const page = pagination(req);
  const visibility = analysisVisibility(auth, 1);
  const values = [...visibility.values, subjectId];
  const clauses = [visibility.sql, `a.subject_id = $${values.length}`];
  if (filters.mode) { values.push(filters.mode); clauses.push(`a.mode = $${values.length}`); }
  values.push(page.limit, page.offset);
  const result = await query<Record<string, unknown> & { totalCount: number }>(
    `SELECT ${analysisColumns}, count(*) OVER()::int AS "totalCount"
     FROM ai_analyses a JOIN users s ON s.id = a.subject_id JOIN users r ON r.id = a.requested_by
     WHERE ${clauses.join(" AND ")} ORDER BY a.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  res.json({
    data: result.rows.map(({ totalCount: _total, ...row }) => row),
    meta: { ...page, total: Number(result.rows[0]?.totalCount ?? 0) }
  });
}));

aiRouter.get("/analyses/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) throw new ApiError(404, "ANALYSIS_NOT_FOUND", "Analysis not found");
  const visibility = analysisVisibility(auth, 2);
  const result = await query(
    `SELECT ${analysisColumns} FROM ai_analyses a JOIN users s ON s.id = a.subject_id JOIN users r ON r.id = a.requested_by
     WHERE a.id = $1 AND ${visibility.sql}`,
    [id.data, ...visibility.values]
  );
  if (!result.rows[0]) throw new ApiError(404, "ANALYSIS_NOT_FOUND", "Analysis not found");
  res.json({ data: result.rows[0] });
}));
