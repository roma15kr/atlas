import { Router } from "express";
import { z } from "zod";
import { manageableUser } from "../access";
import { analyzeWork } from "../ai";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { config } from "../config";
import { asyncHandler } from "../errors";

export const aiRouter = Router();

aiRouter.get("/status", (_req, res) => {
  res.json({ data: { configured: Boolean(config.ANTHROPIC_API_KEY), mode: config.ANTHROPIC_API_KEY ? "CLAUDE_WITH_RULE_FALLBACK" : "RULES" } });
});

aiRouter.post("/analyze", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const input = z.object({
    mode: z.enum(["ADVICE", "EVALUATION", "FORECAST"]),
    targetUserId: z.string().uuid().optional()
  }).parse(req.body);
  const target = await manageableUser(auth, input.targetUserId ?? auth.userId);
  const result = await analyzeWork(auth, target.id, input.mode);
  await writeAudit(req, {
    auth,
    action: "AI_ANALYSIS_REQUESTED",
    entityType: "user",
    entityId: target.id,
    departmentId: target.department_id,
    metadata: { mode: input.mode, source: result.source }
  });
  res.json({ data: result });
}));
