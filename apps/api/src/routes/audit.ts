import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../auth";
import { query } from "../db";
import { asyncHandler } from "../errors";
import { pagination } from "../http";

export const auditRouter = Router();

auditRouter.get("/", requireRoles("DIRECTOR", "MANAGER"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const page = pagination(req);
  const filters = z.object({ action: z.string().max(100).optional(), entityType: z.string().max(100).optional() }).parse(req.query);
  const values: unknown[] = [auth.companyId];
  const clauses = ["al.company_id = $1"];
  if (auth.role === "MANAGER") { values.push(auth.departmentId); clauses.push("al.department_id IS NOT DISTINCT FROM $2"); }
  if (filters.action) { values.push(filters.action); clauses.push(`al.action = $${values.length}`); }
  if (filters.entityType) { values.push(filters.entityType); clauses.push(`al.entity_type = $${values.length}`); }
  values.push(page.limit, page.offset);
  const result = await query(
    `SELECT al.id, al.action, al.entity_type AS "entityType", al.entity_id AS "entityId",
            al.ip::text, al.metadata, al.created_at AS "createdAt",
            COALESCE(u.full_name, 'System') AS "actorName",
            CASE WHEN al.action LIKE '%DENIED' THEN 'DENIED' ELSE 'SUCCESS' END AS result,
            CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'fullName', u.full_name) END AS actor,
            count(*) OVER()::int AS "totalCount"
     FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_id
     WHERE ${clauses.join(" AND ")} ORDER BY al.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  res.json({ data: result.rows.map(stripTotal), meta: { ...page, total: Number(result.rows[0]?.totalCount ?? 0) } });
}));

function stripTotal(row: Record<string, unknown>): Record<string, unknown> {
  const { totalCount: _total, ...rest } = row;
  return rest;
}
