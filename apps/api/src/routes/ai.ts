import { Router } from "express";
import { z } from "zod";
import { manageableUser } from "../access";
import { analyzeWork } from "../ai";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { config } from "../config";
import { asyncHandler } from "../errors";
import { llmConfigured } from "../llm/openai";

export const aiRouter = Router();

aiRouter.get("/status", (_req, res) => {
  const configured = llmConfigured();
  res.json({ data: { configured, provider: "openai", model: config.AI_ANALYSIS_MODEL, mode: configured ? "AI_WITH_RULE_FALLBACK" : "RULES" } });
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
    metadata: { mode: input.mode, source: result.source, model: result.model ?? null }
  });
  res.json({ data: result });
}));
