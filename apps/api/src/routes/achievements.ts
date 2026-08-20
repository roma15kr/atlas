import { Router } from "express";
import { z } from "zod";
import { manageableUser } from "../access";
import { requireAuth } from "../auth";
import { query } from "../db";
import { asyncHandler } from "../errors";

export const achievementsRouter = Router();

achievementsRouter.get("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const parsed = z.object({ userId: z.string().uuid().optional() }).parse(req.query);
  const target = await manageableUser(auth, parsed.userId ?? auth.userId);
  const [achievements, rating] = await Promise.all([
    query(
      `SELECT ua.id, ad.code, ad.name, ad.description, ad.icon, ad.points, ua.awarded_at AS "awardedAt"
       FROM user_achievements ua JOIN achievement_definitions ad ON ad.id = ua.achievement_id
       WHERE ua.user_id = $1 AND ad.company_id = $2 ORDER BY ua.awarded_at DESC`,
      [target.id, auth.companyId]
    ),
    query<{ rating: number }>(
      `SELECT round(COALESCE(sum(LEAST(actual / NULLIF(target, 0), 1.2) * weight) / NULLIF(sum(weight), 0), 0) * 100)::int AS rating
       FROM kpis WHERE company_id = $1 AND user_id = $2`,
      [auth.companyId, target.id]
    )
  ]);
  res.json({ data: achievements.rows, meta: { userId: target.id, rating: rating.rows[0]?.rating ?? 0 } });
}));
