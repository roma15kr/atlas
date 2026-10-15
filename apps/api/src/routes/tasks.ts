import { Router } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { assertAssignableUsers, canAccessBoard } from "../access";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { query, transaction } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { asOptionalDate, pagination } from "../http";
import { boardAccessSql, funnelAccessSql, taskAccessSql } from "../scope";
import type { AuthContext } from "../types";
import { notify } from "../notifications/notify";
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
  dueAt: z.string().datetime().nullable().optional(),
  onBoard: z.boolean().optional()
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
  dueAt: z.string().datetime().nullable().optional(),
  onBoard: z.boolean().optional()
}).refine((value) => value.boardId === undefined || value.stageId !== undefined, {
  path: ["stageId"], message: "Moving a task to another board needs a stage of that board"
});
const taskFilters = z.object({
  boardId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  category: z.enum(STAGE_CATEGORIES).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).optional(),
  dealId: z.string().uuid().optional(),
  assignee: z.union([z.literal("me"), z.string().uuid()]).optional(),
  visibility: z.enum(["board", "personal"]).optional()
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
  assignee_ids: string[];
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
  const access = taskAccessSql(auth, "t");
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
  if (filters.visibility) clauses.push(filters.visibility === "board" ? "t.on_board" : "NOT t.on_board");
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
  await assertAssignableUsers(auth.companyId, assigneeIds);
  if (input.dealId) await assertDealVisible(auth, input.dealId);
  const onBoard = input.onBoard ?? await involvesColleagues(auth.userId, assigneeIds);
  const id = await transaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO tasks
        (company_id, department_id, board_id, stage_id, created_by, deal_id, title, description, priority, position, due_at, completed_at, on_board)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [auth.companyId, stage.department_id, input.boardId, stage.id, auth.userId, input.dealId ?? null,
        input.title, input.description ?? null, input.priority, input.position, asOptionalDate(input.dueAt),
        stage.category === "DONE" ? new Date() : null, onBoard]
    );
    const taskId = result.rows[0]!.id;
    await replaceAssignees(client, taskId, assigneeIds);
    return taskId;
  });
  await writeAudit(req, {
    auth, action: "TASK_CREATED", entityType: "task", entityId: id, departmentId: stage.department_id,
    metadata: { boardId: input.boardId, assignees: assigneeIds.length, onBoard }
  });
  const task = await scopedTask(auth, id);
  await notifyAssigned(auth, task, assigneeIds);
  res.status(201).json({ data: task });
}));

/** `GET /api/v1/tasks/assignable-users`: every active colleague, for the assignee picker (tasks can be assigned across departments). */
tasksRouter.get("/assignable-users", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const result = await query(
    `SELECT u.id, u.full_name AS "fullName", u.role, u.job_title AS "jobTitle", u.avatar_url AS "avatarUrl",
            u.department_id AS "departmentId", d.name AS "departmentName"
     FROM users u LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.company_id = $1 AND u.status = 'ACTIVE' ORDER BY d.name NULLS LAST, u.full_name`,
    [auth.companyId]
  );
  res.json({ data: result.rows });
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
  const outsider = !(await canAccessBoard(auth, current.board_id));
  if (outsider && ((input.boardId && input.boardId !== current.board_id) || input.assigneeIds || input.onBoard !== undefined)) {
    await writeAudit(req, { auth, action: "TASK_UPDATE_DENIED", entityType: "task", entityId: id, departmentId: current.board_department_id,
      metadata: { fields: Object.keys(input).filter((key) => input[key as keyof typeof input] !== undefined) } });
    throw new ApiError(403, "TASK_OUTSIDER_FORBIDDEN", "Only the board's people move a task to another board or change its assignees");
  }
  const boardId = input.boardId ?? current.board_id;
  const boardChanged = boardId !== current.board_id;
  const stage = input.stageId
    ? outsider ? await stageOfBoard(current.board_id, input.stageId) : await boardStage(auth, boardId, input.stageId)
    : undefined;
  if (input.assigneeIds) await assertAssignableUsers(auth.companyId, input.assigneeIds);
  if (input.dealId) await assertDealVisible(auth, input.dealId);
  // Adding a colleague shares the task on the board, unless the request says otherwise; nothing hides it implicitly.
  const shareByAssigning = input.onBoard === undefined && input.assigneeIds
    ? await involvesColleagues(current.created_by, input.assigneeIds.filter((userId) => !current.assignee_ids.includes(userId)))
    : false;

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
    if (input.onBoard !== undefined) set("on_board", input.onBoard);
    else if (shareByAssigning) set("on_board", true);
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
  const task = await scopedTask(auth, id);
  if (input.assigneeIds) await notifyAssigned(auth, task, input.assigneeIds.filter((userId) => !current.assignee_ids.includes(userId)));
  res.json({ data: task });
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
  const access = taskAccessSql(auth, "t", 2);
  const result = await query<TaskRow>(
    `SELECT t.id, t.board_id, t.stage_id, s.category, t.completed_at, t.created_by, b.department_id AS board_department_id,
            ARRAY(SELECT ta.user_id::text FROM task_assignees ta WHERE ta.task_id = t.id) AS assignee_ids
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

/** A stage of the task's own board, for an assignee who can't open the board itself. */
async function stageOfBoard(boardId: string, stageId: string): Promise<StageRow> {
  const result = await query<StageRow>(
    `SELECT s.id, s.category, b.department_id FROM task_board_stages s JOIN task_boards b ON b.id = s.board_id WHERE s.board_id = $1 AND s.id = $2`,
    [boardId, stageId]
  );
  if (!result.rows[0]) throw new ApiError(400, "INVALID_STAGE", "The stage does not belong to the board");
  return result.rows[0];
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

/** New assignees hear about the task; assignees can always open it, so no further visibility check is needed. */
async function notifyAssigned(auth: AuthContext, task: Record<string, unknown>, userIds: string[]): Promise<void> {
  if (!userIds.length) return;
  const actor = await query<{ full_name: string }>("SELECT full_name FROM users WHERE id = $1", [auth.userId]);
  await notify(auth.companyId, userIds, auth.userId, {
    kind: "TASK_ASSIGNED", title: `Новая задача: ${String(task.title)}`, body: `${actor.rows[0]?.full_name ?? "Коллега"} · ${String(task.boardName)}`,
    link: `/tasks?task=${String(task.id)}`, entityType: "task", entityId: String(task.id)
  });
}

/** True when someone other than the author and directors works on the task: then it belongs on the board. */
async function involvesColleagues(authorId: string, assigneeIds: string[]): Promise<boolean> {
  const others = assigneeIds.filter((userId) => userId !== authorId);
  if (!others.length) return false;
  const result = await query("SELECT 1 FROM users WHERE id = ANY($1::uuid[]) AND role <> 'DIRECTOR' LIMIT 1", [others]);
  return Boolean(result.rowCount);
}

async function replaceAssignees(client: PoolClient, taskId: string, userIds: string[]): Promise<void> {
  await client.query("INSERT INTO task_assignees (task_id, user_id) SELECT $1, unnest($2::uuid[])", [taskId, userIds]);
}

async function assertDealVisible(auth: AuthContext, id: string): Promise<void> {
  const scope = dealScope(auth, 2);
  const result = await query(`SELECT d.id FROM deals d WHERE d.id = $1 AND ${scope.sql}`, [id, ...scope.values]);
  if (!result.rowCount) throw new ApiError(404, "DEAL_NOT_FOUND", "Deal not found");
}

const COMMENT_COLUMNS = `c.id, c.body, c.created_at AS "createdAt",
  json_build_object('id', u.id, 'fullName', u.full_name, 'avatarUrl', u.avatar_url) AS author`;

/** `GET /api/v1/tasks/:id/comments`: oldest first, for everyone who can open the task's board. */
tasksRouter.get("/:id/comments", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = z.string().uuid().parse(req.params.id);
  await scopedTask(auth, id);
  const comments = await query(
    `SELECT ${COMMENT_COLUMNS} FROM task_comments c JOIN users u ON u.id = c.author_id
     WHERE c.task_id = $1 AND c.company_id = $2 ORDER BY c.created_at, c.id`,
    [id, auth.companyId]
  );
  res.json({ data: comments.rows });
}));

/** `POST /api/v1/tasks/:id/comments`: 1–5000 characters of Markdown. The audit holds ids only, never the text. */
tasksRouter.post("/:id/comments", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = z.string().uuid().parse(req.params.id);
  await scopedTask(auth, id);
  const input = z.object({ body: z.string().trim().min(1).max(5000) }).strict().parse(req.body);
  const created = await query<{ id: string; department_id: string | null }>(
    `WITH inserted AS (
       INSERT INTO task_comments (company_id, task_id, author_id, body) VALUES ($1, $2, $3, $4) RETURNING id, task_id
     )
     SELECT inserted.id, b.department_id FROM inserted JOIN tasks t ON t.id = inserted.task_id JOIN task_boards b ON b.id = t.board_id`,
    [auth.companyId, id, auth.userId, input.body]
  );
  const comment = created.rows[0]!;
  await writeAudit(req, { auth, action: "TASK_COMMENT_CREATED", entityType: "task", entityId: id, departmentId: comment.department_id, metadata: { commentId: comment.id } });
  // The task's author and assignees can always open it, personal or not.
  const people = await query<{ title: string; created_by: string; author: string; assignee_ids: string[] }>(
    `SELECT t.title, t.created_by, (SELECT full_name FROM users WHERE id = $2) AS author,
            ARRAY(SELECT ta.user_id::text FROM task_assignees ta WHERE ta.task_id = t.id) AS assignee_ids
     FROM tasks t WHERE t.id = $1`, [id, auth.userId]);
  const task = people.rows[0];
  if (task) await notify(auth.companyId, [task.created_by, ...task.assignee_ids], auth.userId, {
    kind: "TASK_COMMENTED", title: `${task.author}: комментарий к «${task.title}»`, body: input.body,
    link: `/tasks?task=${id}`, entityType: "task", entityId: id
  });
  const row = await query(`SELECT ${COMMENT_COLUMNS} FROM task_comments c JOIN users u ON u.id = c.author_id WHERE c.id = $1`, [comment.id]);
  res.status(201).json({ data: row.rows[0] });
}));

async function scopedTask(auth: AuthContext, id: string): Promise<Record<string, unknown>> {
  const access = taskAccessSql(auth, "t", 2);
  const dealAccess = funnelAccessSql(auth, "d.funnel_id", 2 + access.values.length);
  const result = await query(
    `SELECT ${taskColumns(dealAccess.sql)} FROM ${taskFrom} WHERE t.id = $1 AND ${access.sql}`,
    [id, ...access.values, ...dealAccess.values]
  );
  if (!result.rows[0]) throw new ApiError(404, "TASK_NOT_FOUND", "Task not found");
  const task = presentTask(auth, result.rows[0]);
  if (await canAccessBoard(auth, String(task.boardId))) return { ...task, viaAssignment: false };
  // An assignee from outside the board gets the board's stages, to move their task, and nothing else of the board.
  const stages = await query(
    `SELECT id, name, color, category, sort_order AS "sortOrder" FROM task_board_stages WHERE board_id = $1 ORDER BY sort_order, name`,
    [task.boardId]
  );
  return { ...task, viaAssignment: true, boardStages: stages.rows };
}

const taskFrom = `tasks t
  JOIN task_boards b ON b.id = t.board_id
  JOIN task_board_stages s ON s.id = t.stage_id
  LEFT JOIN deals d ON d.id = t.deal_id`;

/** The linked deal summary is hidden from viewers who cannot open the deal's funnel. */
function taskColumns(dealFunnelAccessSql: string): string {
  return `t.id, t.title, t.description, t.priority, t.position, t.on_board AS "onBoard", t.board_id AS "boardId", b.name AS "boardName",
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
