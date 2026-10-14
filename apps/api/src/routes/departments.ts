import { Router } from "express";
import { z } from "zod";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { query } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { scopeDepartments } from "../scope";

const SUMMARY = `d.id, d.name, d.parent_id AS "parentId",
  (SELECT json_build_object('id', h.id, 'fullName', h.full_name) FROM users h
   WHERE h.department_id = d.id AND h.role = 'MANAGER' AND h.status = 'ACTIVE' ORDER BY h.created_at LIMIT 1) AS head,
  (SELECT count(*)::int FROM users m WHERE m.department_id = d.id AND m.status = 'ACTIVE') AS "memberCount"`;

export const departmentsRouter = Router();

/** `GET /api/v1/departments`: every company department for a director, a head's own and sub-departments for a MANAGER. */
departmentsRouter.get("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  if (auth.role === "EMPLOYEE") throw new ApiError(403, "FORBIDDEN", "You do not have permission to perform this action");
  const scoped = auth.role === "DIRECTOR" ? { sql: "", values: [] as unknown[] } : { sql: "AND d.id = ANY($2::uuid[])", values: [scopeDepartments(auth)] };
  const rows = await query(`SELECT ${SUMMARY} FROM departments d WHERE d.company_id = $1 ${scoped.sql} ORDER BY d.name`, [auth.companyId, ...scoped.values]);
  res.json({ data: rows.rows });
}));

/** `PATCH /api/v1/departments/:id { parentId }`: a director places a department under another one (one level), or detaches it. */
departmentsRouter.patch("/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = z.string().uuid().parse(req.params.id);
  if (auth.role !== "DIRECTOR") {
    await writeAudit(req, { auth, action: "DEPARTMENT_UPDATE_DENIED", entityType: "department", entityId: id, metadata: { field: "parentId" } });
    throw new ApiError(403, "DIRECTOR_ONLY", "Only a director changes the department structure");
  }
  const { parentId } = z.object({ parentId: z.string().uuid().nullable() }).strict().parse(req.body);
  const departments = await query<{ id: string; parent_id: string | null; has_children: boolean }>(
    `SELECT d.id, d.parent_id, EXISTS (SELECT 1 FROM departments c WHERE c.parent_id = d.id) AS has_children
     FROM departments d WHERE d.company_id = $1 AND d.id = ANY($2::uuid[])`,
    [auth.companyId, parentId ? [id, parentId] : [id]]
  );
  const department = departments.rows.find((row) => row.id === id);
  if (!department) throw new ApiError(404, "DEPARTMENT_NOT_FOUND", "Department not found");
  if (parentId) {
    const parent = departments.rows.find((row) => row.id === parentId);
    if (!parent) throw new ApiError(400, "INVALID_DEPARTMENT", "The parent department does not belong to this company");
    if (parentId === id || parent.parent_id || department.has_children) {
      throw new ApiError(400, "DEPARTMENT_NESTING", "Departments nest one level only");
    }
  }
  await query("UPDATE departments SET parent_id = $1 WHERE id = $2 AND company_id = $3", [parentId, id, auth.companyId]);
  await writeAudit(req, {
    auth, action: "DEPARTMENT_UPDATED", entityType: "department", entityId: id, departmentId: id,
    metadata: { departmentId: id, parentId, previousParentId: department.parent_id }
  });
  const updated = await query(`SELECT ${SUMMARY} FROM departments d WHERE d.id = $1`, [id]);
  res.json({ data: updated.rows[0] });
}));
