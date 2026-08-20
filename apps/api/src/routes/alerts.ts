import { Router } from "express";
import { z } from "zod";
import { writeAudit } from "../audit";
import { requireAuth, requireRoles } from "../auth";
import { query } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { pagination } from "../http";

export const alertsRouter = Router();

alertsRouter.get("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const page = pagination(req);
  const values: unknown[] = [auth.companyId];
  const clauses = ["a.company_id = $1"];
  if (auth.role === "MANAGER") { values.push(auth.departmentId); clauses.push("a.department_id IS NOT DISTINCT FROM $2"); }
  if (auth.role === "EMPLOYEE") { values.push(auth.userId); clauses.push("a.user_id = $2"); }
  values.push(page.limit, page.offset);
  const result = await query(
    `SELECT a.id, a.severity, a.category, a.title, a.summary, a.evidence,
            a.user_id AS "userId", u.full_name AS "userName", a.acknowledged_at AS "acknowledgedAt",
            (a.acknowledged_at IS NOT NULL) AS acknowledged,
            a.acknowledged_by AS "acknowledgedBy", a.created_at AS "createdAt",
            count(*) OVER()::int AS "totalCount"
     FROM alerts a LEFT JOIN users u ON u.id=a.user_id WHERE ${clauses.join(" AND ")} ORDER BY a.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  res.json({ data: result.rows.map(stripTotal), meta: { ...page, total: Number(result.rows[0]?.totalCount ?? 0) } });
}));

alertsRouter.patch("/:id/acknowledge", requireRoles("DIRECTOR", "MANAGER"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = z.string().uuid().parse(req.params.id);
  const values: unknown[] = [auth.userId, id, auth.companyId];
  let scope = "company_id = $3";
  if (auth.role === "MANAGER") { values.push(auth.departmentId); scope += " AND department_id IS NOT DISTINCT FROM $4"; }
  const result = await query(
    `UPDATE alerts SET acknowledged_at = now(), acknowledged_by = $1
     WHERE id = $2 AND ${scope}
     RETURNING id, acknowledged_at AS "acknowledgedAt", acknowledged_by AS "acknowledgedBy"`,
    values
  );
  if (!result.rows[0]) throw new ApiError(404, "ALERT_NOT_FOUND", "Alert not found");
  await writeAudit(req, { auth, action: "ALERT_ACKNOWLEDGED", entityType: "alert", entityId: id });
  res.json({ data: result.rows[0] });
}));

function stripTotal(row: Record<string, unknown>): Record<string, unknown> {
  const { totalCount: _total, ...rest } = row;
  return rest;
}
