import { Router, type Request } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { query, transaction } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { boardAccessSql, boardManageSql, boardUserAccessSql } from "../scope";
import type { AuthContext } from "../types";
import { assertExactOrder } from "./funnels";

export const STAGE_CATEGORIES = ["TODO", "ACTIVE", "DONE"] as const;
export type StageCategory = (typeof STAGE_CATEGORIES)[number];

const idSchema = z.string().uuid();
const nameSchema = z.string().trim().min(1).max(100);
const stageInputSchema = z.object({
  name: nameSchema,
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#6B7280"),
  category: z.enum(STAGE_CATEGORIES)
});
const memberIdsSchema = z.array(z.string().uuid()).max(200);

export const boardCreateSchema = z.object({
  name: nameSchema,
  departmentId: z.string().uuid().nullable().optional(),
  stages: z.array(stageInputSchema).min(1).max(30),
  memberIds: memberIdsSchema.default([])
}).superRefine((value, ctx) => {
  const names = value.stages.map((stage) => stage.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stages"], message: "Stage names must be unique within a board" });
  }
  if (!hasRequiredCategories(value.stages.map((stage) => stage.category))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stages"], message: "A board needs a TODO stage and a DONE stage" });
  }
});
const boardPatchSchema = z.object({ name: nameSchema.optional(), sortOrder: z.number().int().min(0).max(100_000).optional() });
const membersSchema = z.object({ userIds: memberIdsSchema });
const stagePatchSchema = stageInputSchema.partial();
const orderSchema = z.object({ stageIds: z.array(z.string().uuid()).min(1).max(30) });

interface BoardRow {
  id: string;
  name: string;
  department_id: string | null;
}

export const taskBoardsRouter = Router();

/** Mirrors boardManageSql(): directors manage every board, managers the boards of their own department. */
export function canManageBoard(auth: AuthContext, board: { department_id: string | null }): boolean {
  if (auth.role === "DIRECTOR") return true;
  return auth.role === "MANAGER" && auth.departmentId !== null && board.department_id === auth.departmentId;
}

function hasRequiredCategories(categories: StageCategory[]): boolean {
  return categories.includes("TODO") && categories.includes("DONE");
}

export function assertStageCategories(categories: StageCategory[]): void {
  if (!hasRequiredCategories(categories)) {
    throw new ApiError(400, "STAGE_CATEGORY_REQUIRED", "A board needs at least one TODO stage and one DONE stage");
  }
}

async function denyConfig(req: Request, auth: AuthContext, operation: string, boardId: string | null, departmentId: string | null): Promise<never> {
  await writeAudit(req, {
    auth,
    action: "TASK_BOARD_CONFIG_DENIED",
    entityType: "task_board",
    entityId: boardId,
    departmentId,
    metadata: { operation }
  });
  throw new ApiError(403, "BOARD_MANAGER_ONLY", "Only a director or the department head can configure this board");
}

async function findBoard(auth: AuthContext, id: string): Promise<BoardRow> {
  const access = boardAccessSql(auth, "b.id", 2);
  const board = await query<BoardRow>(
    `SELECT b.id, b.name, b.department_id FROM task_boards b WHERE b.id = $1 AND ${access.sql}`,
    [id, ...access.values]
  );
  if (!board.rows[0]) throw new ApiError(404, "BOARD_NOT_FOUND", "Board not found");
  return board.rows[0];
}

/**
 * Board configuration is limited to board managers. A board the caller cannot open is 404;
 * one they can open but not manage is 403 and audited with the board's department.
 */
export function boardManagerOnly(operation: string) {
  return asyncHandler(async (req, _res, next) => {
    const auth = requireAuth(req);
    const board = await findBoard(auth, idSchema.parse(req.params.id));
    if (!canManageBoard(auth, board)) await denyConfig(req, auth, operation, board.id, board.department_id);
    next();
  });
}

taskBoardsRouter.get("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const access = boardAccessSql(auth, "b.id");
  const boards = await query<BoardRow & { departmentName: string | null; sortOrder: number }>(
    `SELECT b.id, b.name, b.department_id, d.name AS "departmentName", b.sort_order AS "sortOrder"
     FROM task_boards b LEFT JOIN departments d ON d.id = b.department_id
     WHERE ${access.sql}
     ORDER BY d.name NULLS FIRST, b.sort_order, b.name`,
    access.values
  );
  const ids = boards.rows.map((board) => board.id);
  const managed = boards.rows.filter((board) => canManageBoard(auth, board)).map((board) => board.id);
  const [stages, members] = await Promise.all([
    query<Record<string, unknown> & { boardId: string; taskCount: number }>(
      `SELECT s.id, s.board_id AS "boardId", s.name, s.color, s.sort_order AS "sortOrder", s.category,
              (SELECT count(*)::int FROM tasks t WHERE t.stage_id = s.id) AS "taskCount"
       FROM task_board_stages s WHERE s.board_id = ANY($1::uuid[]) ORDER BY s.sort_order, s.name`,
      [ids]
    ),
    query<{ boardId: string; userId: string }>(
      `SELECT board_id AS "boardId", user_id AS "userId" FROM task_board_members WHERE board_id = ANY($1::uuid[])`,
      [managed]
    )
  ]);
  res.json({
    data: boards.rows.map((board) => {
      const own = stages.rows.filter((stage) => stage.boardId === board.id);
      const canManage = managed.includes(board.id);
      return {
        id: board.id,
        name: board.name,
        departmentId: board.department_id,
        departmentName: board.departmentName,
        sortOrder: board.sortOrder,
        canManage,
        taskCount: own.reduce((sum, stage) => sum + stage.taskCount, 0),
        stages: own,
        ...(canManage ? { memberIds: members.rows.filter((member) => member.boardId === board.id).map((member) => member.userId) } : {})
      };
    })
  });
}));

/** Users who can open the board, i.e. who can be assigned to its tasks. */
taskBoardsRouter.get("/:id/users", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const board = await findBoard(auth, idSchema.parse(req.params.id));
  const users = await query(
    `SELECT u.id, u.full_name AS "fullName", u.avatar_url AS "avatarUrl", u.job_title AS "jobTitle", u.role,
            u.department_id AS "departmentId", d.name AS "departmentName",
            EXISTS (SELECT 1 FROM task_board_members m WHERE m.board_id = b.id AND m.user_id = u.id) AS "isMember"
     FROM users u JOIN task_boards b ON b.id = $1 LEFT JOIN departments d ON d.id = u.department_id
     WHERE ${boardUserAccessSql("u", "b")}
     ORDER BY u.full_name`,
    [board.id]
  );
  res.json({ data: users.rows });
}));

/** Active non-director users of the company, for a board manager choosing extra members from any department. */
taskBoardsRouter.get("/:id/candidates", boardManagerOnly("MEMBER_CANDIDATES"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const users = await query(
    `SELECT u.id, u.full_name AS "fullName", u.avatar_url AS "avatarUrl", u.job_title AS "jobTitle",
            u.department_id AS "departmentId", d.name AS "departmentName"
     FROM users u LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.company_id = $1 AND u.status = 'ACTIVE' AND u.role <> 'DIRECTOR'
     ORDER BY d.name NULLS LAST, u.full_name`,
    [auth.companyId]
  );
  res.json({ data: users.rows });
}));

taskBoardsRouter.post("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const input = boardCreateSchema.parse(req.body);
  const departmentId = input.departmentId === undefined
    ? (auth.role === "DIRECTOR" ? null : auth.departmentId)
    : input.departmentId;
  if (!canManageBoard(auth, { department_id: departmentId })) await denyConfig(req, auth, "BOARD_CREATE", null, departmentId);
  const id = await withConstraintErrors(() => transaction(async (client) => {
    if (departmentId) {
      const department = await client.query("SELECT 1 FROM departments WHERE id = $1 AND company_id = $2", [departmentId, auth.companyId]);
      if (!department.rowCount) throw new ApiError(400, "INVALID_DEPARTMENT", "Department does not belong to this company");
    }
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`atlas-task-boards:${auth.companyId}`]);
    const created = await client.query<{ id: string }>(
      `INSERT INTO task_boards (company_id, department_id, name, created_by, sort_order)
       VALUES ($1, $2, $3, $4, (SELECT COALESCE(max(sort_order), 0) + 10 FROM task_boards
                                WHERE company_id = $1 AND department_id IS NOT DISTINCT FROM $2))
       RETURNING id`,
      [auth.companyId, departmentId, input.name, auth.userId]
    );
    const boardId = created.rows[0]!.id;
    for (const [index, stage] of input.stages.entries()) {
      await client.query(
        "INSERT INTO task_board_stages (board_id, name, color, sort_order, category) VALUES ($1,$2,$3,$4,$5)",
        [boardId, stage.name, stage.color, (index + 1) * 10, stage.category]
      );
    }
    await replaceMembers(client, auth, boardId, input.memberIds);
    return boardId;
  }));
  await writeAudit(req, {
    auth, action: "TASK_BOARD_CREATED", entityType: "task_board", entityId: id, departmentId,
    metadata: { name: input.name, stages: input.stages.length, members: unique(input.memberIds).length }
  });
  res.status(201).json({ data: { id, departmentId } });
}));

taskBoardsRouter.patch("/:id", boardManagerOnly("BOARD_UPDATE"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const input = boardPatchSchema.parse(req.body);
  if (input.name === undefined && input.sortOrder === undefined) throw new ApiError(400, "NO_CHANGES", "No fields to update");
  const board = await withConstraintErrors(() => transaction(async (client) => {
    const locked = await lockBoard(client, auth, id);
    await client.query(
      "UPDATE task_boards SET name = COALESCE($2, name), sort_order = COALESCE($3, sort_order) WHERE id = $1",
      [id, input.name ?? null, input.sortOrder ?? null]
    );
    return locked;
  }));
  await writeAudit(req, {
    auth, action: "TASK_BOARD_UPDATED", entityType: "task_board", entityId: id, departmentId: board.department_id,
    metadata: { fields: Object.keys(input), previousName: board.name }
  });
  res.json({ data: { id } });
}));

taskBoardsRouter.delete("/:id", boardManagerOnly("BOARD_DELETE"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const board = await withConstraintErrors(() => transaction(async (client) => {
    const locked = await lockBoard(client, auth, id);
    const tasks = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM tasks WHERE board_id = $1", [id]);
    if (tasks.rows[0]!.count > 0) throw new ApiError(409, "BOARD_NOT_EMPTY", "Move or delete the board's tasks first");
    await client.query("DELETE FROM task_boards WHERE id = $1", [id]);
    return locked;
  }));
  await writeAudit(req, {
    auth, action: "TASK_BOARD_DELETED", entityType: "task_board", entityId: id, departmentId: board.department_id,
    metadata: { name: board.name }
  });
  res.status(204).send();
}));

taskBoardsRouter.put("/:id/members", boardManagerOnly("MEMBERS_UPDATE"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const input = membersSchema.parse(req.body);
  const { board, previous } = await withConstraintErrors(() => transaction(async (client) => {
    const locked = await lockBoard(client, auth, id);
    const current = await client.query<{ userId: string }>(
      `SELECT user_id AS "userId" FROM task_board_members WHERE board_id = $1 ORDER BY created_at`,
      [id]
    );
    await client.query("DELETE FROM task_board_members WHERE board_id = $1", [id]);
    await replaceMembers(client, auth, id, input.userIds);
    return { board: locked, previous: current.rows.map((row) => row.userId) };
  }));
  const next = unique(input.userIds);
  await writeAudit(req, {
    auth, action: "TASK_BOARD_MEMBERS_UPDATED", entityType: "task_board", entityId: id, departmentId: board.department_id,
    metadata: { previous, next }
  });
  res.json({ data: { id, memberIds: next } });
}));

taskBoardsRouter.post("/:id/stages", boardManagerOnly("STAGE_CREATE"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const input = stageInputSchema.parse(req.body);
  const { board, stage } = await withConstraintErrors(() => transaction(async (client) => {
    const locked = await lockBoard(client, auth, id);
    const created = await client.query<{ id: string }>(
      `INSERT INTO task_board_stages (board_id, name, color, sort_order, category)
       VALUES ($1, $2, $3, (SELECT COALESCE(max(sort_order), 0) + 10 FROM task_board_stages WHERE board_id = $1), $4)
       RETURNING id, board_id AS "boardId", name, color, sort_order AS "sortOrder", category`,
      [id, input.name, input.color, input.category]
    );
    return { board: locked, stage: created.rows[0]! };
  }));
  await writeAudit(req, {
    auth, action: "TASK_STAGE_CREATED", entityType: "task_stage", entityId: stage.id, departmentId: board.department_id,
    metadata: { boardId: id, name: input.name, category: input.category }
  });
  res.status(201).json({ data: { ...stage, taskCount: 0 } });
}));

taskBoardsRouter.put("/:id/stages/order", boardManagerOnly("STAGE_REORDER"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const input = orderSchema.parse(req.body);
  const board = await transaction(async (client) => {
    const locked = await lockBoard(client, auth, id);
    const stages = await client.query<{ id: string }>("SELECT id FROM task_board_stages WHERE board_id = $1", [id]);
    assertExactOrder(stages.rows.map((stage) => stage.id), input.stageIds);
    await client.query(
      `UPDATE task_board_stages s SET sort_order = ordered.position * 10
       FROM unnest($2::uuid[]) WITH ORDINALITY AS ordered(id, position)
       WHERE s.id = ordered.id AND s.board_id = $1`,
      [id, input.stageIds]
    );
    return locked;
  });
  await writeAudit(req, {
    auth, action: "TASK_STAGES_REORDERED", entityType: "task_board", entityId: id, departmentId: board.department_id,
    metadata: { stageIds: input.stageIds }
  });
  res.json({ data: { id, stageIds: input.stageIds } });
}));

taskBoardsRouter.patch("/:id/stages/:stageId", boardManagerOnly("STAGE_UPDATE"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const stageId = idSchema.parse(req.params.stageId);
  const input = stagePatchSchema.parse(req.body);
  if (!Object.keys(input).length) throw new ApiError(400, "NO_CHANGES", "No fields to update");
  const { board, stage } = await withConstraintErrors(() => transaction(async (client) => {
    const locked = await lockBoard(client, auth, id);
    const previous = await client.query<{ category: StageCategory }>(
      "SELECT category FROM task_board_stages WHERE id = $1 AND board_id = $2",
      [stageId, id]
    );
    if (!previous.rows[0]) throw new ApiError(404, "STAGE_NOT_FOUND", "Stage not found");
    const updated = await client.query<{ id: string; category: StageCategory }>(
      `UPDATE task_board_stages SET name = COALESCE($3, name), color = COALESCE($4, color), category = COALESCE($5, category)
       WHERE id = $2 AND board_id = $1
       RETURNING id, board_id AS "boardId", name, color, sort_order AS "sortOrder", category`,
      [id, stageId, input.name ?? null, input.color ?? null, input.category ?? null]
    );
    await assertBoardStageCategories(client, id);
    const row = updated.rows[0]!;
    if ((previous.rows[0].category === "DONE") !== (row.category === "DONE")) {
      await client.query(completionSql("stage_id = $1"), [stageId, row.category]);
    }
    return { board: locked, stage: row };
  }));
  await writeAudit(req, {
    auth, action: "TASK_STAGE_UPDATED", entityType: "task_stage", entityId: stageId, departmentId: board.department_id,
    metadata: { boardId: id, fields: Object.keys(input) }
  });
  res.json({ data: stage });
}));

taskBoardsRouter.delete("/:id/stages/:stageId", boardManagerOnly("STAGE_DELETE"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const stageId = idSchema.parse(req.params.stageId);
  const { moveToStageId } = z.object({ moveToStageId: z.string().uuid().optional() }).parse(req.query);
  const { board, movedTasks } = await withConstraintErrors(() => transaction(async (client) => {
    const locked = await lockBoard(client, auth, id);
    const stages = await client.query<{ id: string; category: StageCategory }>(
      "SELECT id, category FROM task_board_stages WHERE board_id = $1",
      [id]
    );
    const stage = stages.rows.find((row) => row.id === stageId);
    if (!stage) throw new ApiError(404, "STAGE_NOT_FOUND", "Stage not found");
    if (stages.rows.length === 1) throw new ApiError(409, "LAST_STAGE", "A board's last stage cannot be deleted");
    const target = moveToStageId === undefined ? undefined : stages.rows.find((row) => row.id === moveToStageId);
    if (moveToStageId !== undefined && (moveToStageId === stageId || !target)) {
      throw new ApiError(400, "INVALID_TARGET_STAGE", "Target stage must be another stage of the same board");
    }
    assertStageCategories(stages.rows.filter((row) => row.id !== stageId).map((row) => row.category));
    const tasks = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM tasks WHERE stage_id = $1", [stageId]);
    const count = tasks.rows[0]!.count;
    if (count > 0 && !target) throw new ApiError(400, "TARGET_STAGE_REQUIRED", "Choose a stage to move this stage's tasks to");
    let moved = 0;
    if (count > 0 && target) {
      if ((stage.category === "DONE") !== (target.category === "DONE")) {
        await client.query(completionSql("stage_id = $1"), [stageId, target.category]);
      }
      moved = (await client.query("UPDATE tasks SET stage_id = $2 WHERE stage_id = $1", [stageId, target.id])).rowCount ?? 0;
    }
    await client.query("DELETE FROM task_board_stages WHERE id = $1", [stageId]);
    return { board: locked, movedTasks: moved };
  }));
  await writeAudit(req, {
    auth, action: "TASK_STAGE_DELETED", entityType: "task_stage", entityId: stageId, departmentId: board.department_id,
    metadata: { boardId: id, targetStageId: moveToStageId ?? null, movedTasks }
  });
  res.status(204).send();
}));

/** Sets or clears completed_at for tasks entering ($2 = 'DONE') or leaving the DONE category. */
function completionSql(where: string): string {
  return `UPDATE tasks SET completed_at = CASE WHEN $2::text = 'DONE' THEN COALESCE(completed_at, now()) ELSE NULL END WHERE ${where}`;
}

async function lockBoard(client: PoolClient, auth: AuthContext, id: string): Promise<BoardRow> {
  const manage = boardManageSql(auth, "b.id", 2);
  const board = await client.query<BoardRow>(
    `SELECT b.id, b.name, b.department_id FROM task_boards b WHERE b.id = $1 AND ${manage.sql} FOR UPDATE`,
    [id, ...manage.values]
  );
  if (!board.rows[0]) throw new ApiError(404, "BOARD_NOT_FOUND", "Board not found");
  return board.rows[0];
}

async function assertBoardStageCategories(client: PoolClient, boardId: string): Promise<void> {
  const categories = await client.query<{ category: StageCategory }>("SELECT category FROM task_board_stages WHERE board_id = $1", [boardId]);
  assertStageCategories(categories.rows.map((row) => row.category));
}

async function replaceMembers(client: PoolClient, auth: AuthContext, boardId: string, userIds: string[]): Promise<void> {
  const users = unique(userIds);
  const valid = await client.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM users WHERE company_id = $1 AND status = 'ACTIVE' AND id = ANY($2::uuid[])",
    [auth.companyId, users]
  );
  if (valid.rows[0]!.count !== users.length) {
    throw new ApiError(400, "INVALID_MEMBER", "Every member must be an active user of the company");
  }
  await client.query("INSERT INTO task_board_members (board_id, user_id) SELECT $1, unnest($2::uuid[])", [boardId, users]);
}

async function withConstraintErrors<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    const constraint = error && typeof error === "object" && "constraint" in error ? String(error.constraint) : "";
    if (code === "23505" && constraint === "task_boards_department_name_unique") {
      throw new ApiError(409, "BOARD_NAME_TAKEN", "A board with this name already exists in the department");
    }
    if (code === "23505" && constraint === "task_board_stages_board_name_unique") {
      throw new ApiError(409, "STAGE_NAME_TAKEN", "A stage with this name already exists on the board");
    }
    if (code === "23503") {
      throw new ApiError(409, "CONFLICT_RETRY", "Tasks changed while the board was being updated; try again");
    }
    throw error;
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
