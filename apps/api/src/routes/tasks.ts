import { Router } from "express";
import { z } from "zod";
import { manageableUser } from "../access";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { query } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { asOptionalDate, pagination, updatedFields } from "../http";
import { recordScope } from "../scope";

const taskInput = z.object({
  assigneeId: z.string().uuid().optional(),
  dealId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(10_000).nullable().optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).default("TODO"),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
  position: z.coerce.number().int().min(0).max(1_000_000).default(0),
  dueAt: z.string().datetime().nullable().optional()
});
const taskPatch = taskInput.partial();
const idSchema = z.string().uuid();

export const tasksRouter = Router();

tasksRouter.get("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const page = pagination(req);
  const filters = z.object({
    status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
    assigneeId: z.string().uuid().optional(),
    dealId: z.string().uuid().optional()
  }).parse(req.query);
  const scope = recordScope(auth, { company: "t.company_id", department: "t.department_id", owner: "t.assignee_id" });
  const values: unknown[] = [...scope.values];
  const clauses = [scope.sql];
  if (filters.status) { values.push(filters.status); clauses.push(`t.status = $${values.length}`); }
  if (filters.assigneeId) { values.push(filters.assigneeId); clauses.push(`t.assignee_id = $${values.length}`); }
  if (filters.dealId) { values.push(filters.dealId); clauses.push(`t.deal_id = $${values.length}`); }
  values.push(page.limit, page.offset);
  const result = await query(
    `SELECT ${taskColumns()}, count(*) OVER()::int AS "totalCount"
     FROM tasks t JOIN users u ON u.id = t.assignee_id LEFT JOIN deals d ON d.id = t.deal_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY t.status, t.position, t.due_at NULLS LAST
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  res.json({ data: result.rows.map(stripTotal), meta: { ...page, total: Number(result.rows[0]?.totalCount ?? 0) } });
}));

tasksRouter.post("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const input = taskInput.parse(req.body);
  const assignee = await manageableUser(auth, input.assigneeId);
  if (input.dealId) await assertDealVisible(auth, input.dealId);
  const completedAt = input.status === "DONE" ? new Date().toISOString() : null;
  const result = await query(
    `INSERT INTO tasks
      (company_id, department_id, assignee_id, created_by, deal_id, title, description, status, priority, position, due_at, completed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [auth.companyId, assignee.department_id, assignee.id, auth.userId, input.dealId ?? null,
      input.title, input.description ?? null, input.status, input.priority, input.position, asOptionalDate(input.dueAt), completedAt]
  );
  const id = result.rows[0]?.id as string;
  await writeAudit(req, { auth, action: "TASK_CREATED", entityType: "task", entityId: id, departmentId: assignee.department_id });
  res.status(201).json({ data: await scopedTask(auth, id) });
}));

tasksRouter.get("/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  res.json({ data: await scopedTask(auth, idSchema.parse(req.params.id)) });
}));

tasksRouter.patch("/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  await scopedTask(auth, id);
  const input = taskPatch.parse(req.body);
  const data: Record<string, unknown> = { ...input, dueAt: asOptionalDate(input.dueAt) };
  if (input.assigneeId) {
    const assignee = await manageableUser(auth, input.assigneeId);
    data.assigneeId = assignee.id;
    data.departmentId = assignee.department_id;
  }
  if (input.dealId) await assertDealVisible(auth, input.dealId);
  if (input.status !== undefined) data.completedAt = input.status === "DONE" ? new Date().toISOString() : null;
  const update = updatedFields(data, {
    assigneeId: "assignee_id", departmentId: "department_id", dealId: "deal_id", title: "title",
    description: "description", status: "status", priority: "priority", position: "position", dueAt: "due_at", completedAt: "completed_at"
  });
  if (!update.values.length) throw new ApiError(400, "NO_CHANGES", "No fields to update");
  update.values.push(id, auth.companyId);
  await query(`UPDATE tasks SET ${update.sql} WHERE id = $${update.values.length - 1} AND company_id = $${update.values.length}`, update.values);
  await writeAudit(req, { auth, action: "TASK_UPDATED", entityType: "task", entityId: id, metadata: { fields: Object.keys(input) } });
  res.json({ data: await scopedTask(auth, id) });
}));

tasksRouter.delete("/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  await scopedTask(auth, id);
  await query("DELETE FROM tasks WHERE id = $1 AND company_id = $2", [id, auth.companyId]);
  await writeAudit(req, { auth, action: "TASK_DELETED", entityType: "task", entityId: id });
  res.status(204).send();
}));

async function assertDealVisible(auth: ReturnType<typeof requireAuth>, id: string): Promise<void> {
  const scope = recordScope(auth, { company: "company_id", department: "department_id", owner: "owner_id" }, 2);
  const result = await query(`SELECT id FROM deals WHERE id = $1 AND ${scope.sql}`, [id, ...scope.values]);
  if (!result.rowCount) throw new ApiError(404, "DEAL_NOT_FOUND", "Deal not found");
}

async function scopedTask(auth: ReturnType<typeof requireAuth>, id: string): Promise<Record<string, unknown>> {
  const scope = recordScope(auth, { company: "t.company_id", department: "t.department_id", owner: "t.assignee_id" }, 2);
  const result = await query(
    `SELECT ${taskColumns()}
     FROM tasks t JOIN users u ON u.id = t.assignee_id LEFT JOIN deals d ON d.id = t.deal_id
     WHERE t.id = $1 AND ${scope.sql}`,
    [id, ...scope.values]
  );
  if (!result.rows[0]) throw new ApiError(404, "TASK_NOT_FOUND", "Task not found");
  return result.rows[0];
}

function taskColumns(): string {
  return `t.id, t.title, t.description, t.status, t.priority, t.position, t.assignee_id AS "assigneeId",
    t.created_by AS "createdBy", t.deal_id AS "dealId", t.due_at AS "dueAt",
    t.completed_at AS "completedAt", t.created_at AS "createdAt", t.updated_at AS "updatedAt",
    json_build_object('id', u.id, 'fullName', u.full_name) AS assignee,
    CASE WHEN d.id IS NULL THEN NULL ELSE json_build_object('id', d.id, 'title', d.title) END AS deal`;
}

function stripTotal(row: Record<string, unknown>): Record<string, unknown> {
  const { totalCount: _total, ...rest } = row;
  return rest;
}
