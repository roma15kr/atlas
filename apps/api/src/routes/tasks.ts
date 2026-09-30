import { Router } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { assertAssigneesBoardAccess } from "../access";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { query, transaction } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { asOptionalDate, pagination } from "../http";
import { boardAccessSql, funnelAccessSql } from "../scope";
import type { AuthContext } from "../types";
import { dealScope } from "./deals";
import { canManageBoard, STAGE_CATEGORIES, type StageCategory } from "./taskBoards";

export const MAX_ASSIGNEES = 20;

const assigneeIdsSchema = z.array(z.string().uuid()).min(1).max(MAX_ASSIGNEES)
  .transform((ids) => [...new Set(ids)]);

export const taskInput = z.object({
  boardId: z.string().uuid(),
  stageId: z.string().uuid().optional(),
  assigneeIds: assigneeIdsSchema.optional(),
  dealId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(10_000).nullable().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
  position: z.coerce.number().int().min(0).max(1_000_000).default(0),
  dueAt: z.string().datetime().nullable().optional()
});
export const taskPatch = z.object({
  boardId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  assigneeIds: assigneeIdsSchema.optional(),
  dealId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(240).optional(),
  description: z.string().trim().max(10_000).nullable().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).optional(),
  position: z.coerce.number().int().min(0).max(1_000_000).optional(),
  dueAt: z.string().datetime().nullable().optional()
}).refine((value) => value.boardId === undefined || value.stageId !== undefined, {
  path: ["stageId"], message: "Moving a task to another board needs a stage of that board"
});
const taskFilters = z.object({
  boardId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  category: z.enum(STAGE_CATEGORIES).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).optional(),
  dealId: z.string().uuid().optional(),
  assignee: z.union([z.literal("me"), z.string().uuid()]).optional()
});
const idSchema = z.string().uuid();

/**
 * completed_at follows the stage category: it is stamped when a task enters DONE, cleared when it
 * leaves DONE, and kept for any move that stays on the same side (including a drop into the same stage).
 */
export function nextCompletedAt<T>(previous: StageCategory, next: StageCategory, completedAt: T | null, now: T): T | null {
  if ((previous === "DONE") === (next === "DONE")) return completedAt;
  return next === "DONE" ? now : null;
}

interface TaskRow {
  id: string;
  board_id: string;
  stage_id: string;
  category: StageCategory;
  completed_at: Date | null;
  created_by: string;
  board_department_id: string | null;
}

interface StageRow {
  id: string;
  category: StageCategory;
  department_id: string | null;
}

export const tasksRouter = Router();

tasksRouter.get("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const page = pagination(req);
  const filters = taskFilters.parse(req.query);
  const access = boardAccessSql(auth, "t.board_id");
  const values: unknown[] = [...access.values];
  const clauses = [access.sql];
  if (filters.boardId) { values.push(filters.boardId); clauses.push(`t.board_id = $${values.length}`); }
  if (filters.stageId) { values.push(filters.stageId); clauses.push(`t.stage_id = $${values.length}`); }
  if (filters.category) { values.push(filters.category); clauses.push(`s.category = $${values.length}`); }
  if (filters.priority) { values.push(filters.priority); clauses.push(`t.priority = $${values.length}`); }
  if (filters.dealId) { values.push(filters.dealId); clauses.push(`t.deal_id = $${values.length}`); }
  if (filters.assignee) {
    values.push(filters.assignee === "me" ? auth.userId : filters.assignee);
    clauses.push(`EXISTS (SELECT 1 FROM task_assignees fa WHERE fa.task_id = t.id AND fa.user_id = $${values.length})`);
  }
  const dealAccess = funnelAccessSql(auth, "d.funnel_id", values.length + 1);
  values.push(...dealAccess.values, page.limit, page.offset);
  const result = await query(
    `SELECT ${taskColumns(dealAccess.sql)}, count(*) OVER()::int AS "totalCount"
     FROM ${taskFrom}
     WHERE ${clauses.join(" AND ")}
     ORDER BY s.sort_order, t.position, t.due_at NULLS LAST, t.created_at
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  res.json({ data: result.rows.map((row) => presentTask(auth, row)), meta: { ...page, total: Number(result.rows[0]?.totalCount ?? 0) } });
}));

tasksRouter.post("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const input = taskInput.parse(req.body);
  const assigneeIds = input.assigneeIds ?? [auth.userId];
  const stage = input.stageId
    ? await boardStage(auth, input.boardId, input.stageId)
    : await firstTodoStage(auth, input.boardId);
  await assertAssigneesBoardAccess(input.boardId, assigneeIds);
  if (input.dealId) await assertDealVisible(auth, input.dealId);
  const id = await transaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO tasks
        (company_id, department_id, board_id, stage_id, created_by, deal_id, title, description, priority, position, due_at, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [auth.companyId, stage.department_id, input.boardId, stage.id, auth.userId, input.dealId ?? null,
        input.title, input.description ?? null, input.priority, input.position, asOptionalDate(input.dueAt),
        stage.category === "DONE" ? new Date() : null]
    );
    const taskId = result.rows[0]!.id;
    await replaceAssignees(client, taskId, assigneeIds);
    return taskId;
  });
  await writeAudit(req, {
    auth, action: "TASK_CREATED", entityType: "task", entityId: id, departmentId: stage.department_id,
    metadata: { boardId: input.boardId, assignees: assigneeIds.length }
  });
  res.status(201).json({ data: await scopedTask(auth, id) });
}));

tasksRouter.get("/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  res.json({ data: await scopedTask(auth, idSchema.parse(req.params.id)) });
}));

tasksRouter.patch("/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const input = taskPatch.parse(req.body);
  if (!Object.values(input).some((value) => value !== undefined)) throw new ApiError(400, "NO_CHANGES", "No fields to update");
  const current = await accessibleTask(auth, id);
  const boardId = input.boardId ?? current.board_id;
  const boardChanged = boardId !== current.board_id;
  const stage = input.stageId ? await boardStage(auth, boardId, input.stageId) : undefined;
  if (input.assigneeIds) {
    await assertAssigneesBoardAccess(boardId, input.assigneeIds);
  } else if (boardChanged) {
    await assertAssigneesBoardAccess(boardId, await currentAssignees(id));
  }
  if (input.dealId) await assertDealVisible(auth, input.dealId);

  const departmentId = await transaction(async (client) => {
    const locked = await client.query<TaskRow>(
      `SELECT t.id, t.board_id, t.stage_id, s.category, t.completed_at
       FROM tasks t JOIN task_board_stages s ON s.id = t.stage_id WHERE t.id = $1 FOR UPDATE OF t`,
      [id]
    );
    const row = locked.rows[0];
    if (!row) throw new ApiError(404, "TASK_NOT_FOUND", "Task not found");
    const assignments: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    };
    if (stage) {
      if (boardChanged) {
        set("board_id", boardId);
        set("department_id", stage.department_id);
      }
      set("stage_id", stage.id);
      set("completed_at", nextCompletedAt(row.category, stage.category, row.completed_at, new Date()));
    }
    if (input.dealId !== undefined) set("deal_id", input.dealId);
    if (input.title !== undefined) set("title", input.title);
    if (input.description !== undefined) set("description", input.description);
    if (input.priority !== undefined) set("priority", input.priority);
    if (input.position !== undefined) set("position", input.position);
    if (input.dueAt !== undefined) set("due_at", asOptionalDate(input.dueAt));
    if (assignments.length) {
      values.push(id);
      await client.query(`UPDATE tasks SET ${assignments.join(", ")} WHERE id = $${values.length}`, values);
    }
    if (input.assigneeIds) {
      await client.query("DELETE FROM task_assignees WHERE task_id = $1", [id]);
      await replaceAssignees(client, id, input.assigneeIds);
    }
    return stage && boardChanged ? stage.department_id : current.board_department_id;
  });
  await writeAudit(req, {
    auth, action: "TASK_UPDATED", entityType: "task", entityId: id, departmentId,
    metadata: { fields: Object.keys(input).filter((key) => input[key as keyof typeof input] !== undefined), ...(boardChanged ? { boardId } : {}) }
  });
  res.json({ data: await scopedTask(auth, id) });
}));

tasksRouter.delete("/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const task = await accessibleTask(auth, id);
  if (task.created_by !== auth.userId && !canManageBoard(auth, { department_id: task.board_department_id })) {
    throw new ApiError(403, "TASK_DELETE_FORBIDDEN", "Only the task's creator or the board's manager can delete it");
  }
  await query("DELETE FROM tasks WHERE id = $1 AND company_id = $2", [id, auth.companyId]);
  await writeAudit(req, { auth, action: "TASK_DELETED", entityType: "task", entityId: id, departmentId: task.board_department_id, metadata: { boardId: task.board_id } });
  res.status(204).send();
}));

async function accessibleTask(auth: AuthContext, id: string): Promise<TaskRow> {
  const access = boardAccessSql(auth, "t.board_id", 2);
  const result = await query<TaskRow>(
    `SELECT t.id, t.board_id, t.stage_id, s.category, t.completed_at, t.created_by, b.department_id AS board_department_id
     FROM tasks t JOIN task_board_stages s ON s.id = t.stage_id JOIN task_boards b ON b.id = t.board_id
     WHERE t.id = $1 AND ${access.sql}`,
    [id, ...access.values]
  );
  if (!result.rows[0]) throw new ApiError(404, "TASK_NOT_FOUND", "Task not found");
  return result.rows[0];
}

async function boardStage(auth: AuthContext, boardId: string, stageId: string): Promise<StageRow> {
  const access = boardAccessSql(auth, "b.id", 3);
  const result = await query<StageRow & { stage_found: boolean }>(
    `SELECT s.id, s.category, b.department_id
     FROM task_boards b LEFT JOIN task_board_stages s ON s.board_id = b.id AND s.id = $2
     WHERE b.id = $1 AND ${access.sql}`,
    [boardId, stageId, ...access.values]
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "BOARD_NOT_FOUND", "Board not found");
  if (!row.id) throw new ApiError(400, "INVALID_STAGE", "The stage does not belong to the board");
  return row;
}

async function firstTodoStage(auth: AuthContext, boardId: string): Promise<StageRow> {
  const access = boardAccessSql(auth, "b.id", 2);
  const result = await query<StageRow>(
    `SELECT s.id, s.category, b.department_id
     FROM task_boards b LEFT JOIN LATERAL (
       SELECT id, category FROM task_board_stages
       WHERE board_id = b.id AND category = 'TODO' ORDER BY sort_order, name LIMIT 1
     ) s ON true
     WHERE b.id = $1 AND ${access.sql}`,
    [boardId, ...access.values]
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "BOARD_NOT_FOUND", "Board not found");
  if (!row.id) throw new ApiError(409, "STAGE_CATEGORY_REQUIRED", "The board has no TODO stage");
  return row;
}

async function currentAssignees(taskId: string): Promise<string[]> {
  const result = await query<{ user_id: string }>("SELECT user_id FROM task_assignees WHERE task_id = $1", [taskId]);
  return result.rows.map((row) => row.user_id);
}

async function replaceAssignees(client: PoolClient, taskId: string, userIds: string[]): Promise<void> {
  await client.query("INSERT INTO task_assignees (task_id, user_id) SELECT $1, unnest($2::uuid[])", [taskId, userIds]);
}

async function assertDealVisible(auth: AuthContext, id: string): Promise<void> {
  const scope = dealScope(auth, 2);
  const result = await query(`SELECT d.id FROM deals d WHERE d.id = $1 AND ${scope.sql}`, [id, ...scope.values]);
  if (!result.rowCount) throw new ApiError(404, "DEAL_NOT_FOUND", "Deal not found");
}

async function scopedTask(auth: AuthContext, id: string): Promise<Record<string, unknown>> {
  const access = boardAccessSql(auth, "t.board_id", 2);
  const dealAccess = funnelAccessSql(auth, "d.funnel_id", 2 + access.values.length);
  const result = await query(
    `SELECT ${taskColumns(dealAccess.sql)} FROM ${taskFrom} WHERE t.id = $1 AND ${access.sql}`,
    [id, ...access.values, ...dealAccess.values]
  );
  if (!result.rows[0]) throw new ApiError(404, "TASK_NOT_FOUND", "Task not found");
  return presentTask(auth, result.rows[0]);
}

const taskFrom = `tasks t
  JOIN task_boards b ON b.id = t.board_id
  JOIN task_board_stages s ON s.id = t.stage_id
  LEFT JOIN deals d ON d.id = t.deal_id`;

/** The linked deal summary is hidden from viewers who cannot open the deal's funnel. */
function taskColumns(dealFunnelAccessSql: string): string {
  return `t.id, t.title, t.description, t.priority, t.position, t.board_id AS "boardId", b.name AS "boardName",
    b.department_id AS "boardDepartmentId",
    json_build_object('id', s.id, 'name', s.name, 'color', s.color, 'category', s.category) AS stage,
    COALESCE((
      SELECT json_agg(json_build_object('id', au.id, 'fullName', au.full_name, 'avatarUrl', au.avatar_url) ORDER BY au.full_name)
      FROM task_assignees ta JOIN users au ON au.id = ta.user_id WHERE ta.task_id = t.id
    ), '[]'::json) AS assignees,
    t.created_by AS "createdBy", CASE WHEN ${dealFunnelAccessSql} THEN t.deal_id END AS "dealId", t.due_at AS "dueAt",
    t.completed_at AS "completedAt", t.created_at AS "createdAt", t.updated_at AS "updatedAt",
    CASE WHEN d.id IS NOT NULL AND ${dealFunnelAccessSql}
      THEN json_build_object('id', d.id, 'title', d.title) END AS deal`;
}

function presentTask(auth: AuthContext, row: Record<string, unknown>): Record<string, unknown> {
  const { totalCount: _total, boardDepartmentId, ...rest } = row;
  const canDelete = rest.createdBy === auth.userId || canManageBoard(auth, { department_id: (boardDepartmentId as string | null) ?? null });
  return { ...rest, canDelete };
}
