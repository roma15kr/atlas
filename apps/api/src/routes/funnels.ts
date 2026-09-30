import { Router, type NextFunction, type Request, type Response } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { query, transaction } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { funnelAccessSql } from "../scope";
import type { AuthContext } from "../types";

const OUTCOMES = ["OPEN", "WON", "LOST"] as const;
type Outcome = (typeof OUTCOMES)[number];

const idSchema = z.string().uuid();
const nameSchema = z.string().trim().min(1).max(100);
const stageInputSchema = z.object({
  name: nameSchema,
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#6B7280"),
  outcome: z.enum(OUTCOMES).default("OPEN")
});
const accessInputSchema = z.object({
  accessMode: z.enum(["COMPANY", "RESTRICTED"]),
  departmentIds: z.array(z.string().uuid()).max(200).default([]),
  userIds: z.array(z.string().uuid()).max(500).default([])
});

export const funnelCreateSchema = accessInputSchema.partial({ accessMode: true }).extend({
  name: nameSchema,
  stages: z.array(stageInputSchema).min(1).max(30)
}).superRefine((value, ctx) => {
  const names = value.stages.map((stage) => stage.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stages"], message: "Stage names must be unique within a funnel" });
  }
  if (!value.stages.some((stage) => stage.outcome === "OPEN")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stages"], message: "A funnel needs at least one OPEN stage" });
  }
});
const funnelPatchSchema = z.object({ name: nameSchema.optional(), sortOrder: z.number().int().min(0).max(100_000).optional() });
const stagePatchSchema = stageInputSchema.partial();
const orderSchema = z.object({ stageIds: z.array(z.string().uuid()).min(1).max(30) });

export const funnelsRouter = Router();

/** Funnel and stage configuration is Director-only; denied attempts are audited like other sensitive denials. */
export function directorOnlyConfig(operation: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (auth?.role === "DIRECTOR") {
      next();
      return;
    }
    void writeAudit(req, {
      auth,
      action: "FUNNEL_CONFIG_DENIED",
      entityType: "deal_funnel",
      entityId: typeof req.params.id === "string" ? req.params.id : null,
      metadata: { operation }
    }).then(
      () => next(new ApiError(403, "DIRECTOR_ONLY", "Only a director can configure funnels")),
      next
    );
  };
}

/** Rejects a stage order that is not an exact permutation of the funnel's stages. */
export function assertExactOrder(existingIds: string[], submittedIds: string[]): void {
  const existing = new Set(existingIds);
  const submitted = new Set(submittedIds);
  if (submitted.size !== submittedIds.length || submitted.size !== existing.size || [...submitted].some((id) => !existing.has(id))) {
    throw new ApiError(400, "INVALID_STAGE_ORDER", "Stage order must list every stage of the funnel exactly once");
  }
}

export function assertOpenStage(outcomes: Outcome[]): void {
  if (!outcomes.includes("OPEN")) {
    throw new ApiError(400, "OPEN_STAGE_REQUIRED", "A funnel needs at least one OPEN stage");
  }
}

funnelsRouter.get("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const director = auth.role === "DIRECTOR";
  const access = funnelAccessSql(auth, "f.id");
  const funnels = await query<{ id: string; name: string; sortOrder: number; accessMode: string }>(
    `SELECT f.id, f.name, f.sort_order AS "sortOrder", f.access_mode AS "accessMode"
     FROM deal_funnels f WHERE ${access.sql} ORDER BY f.sort_order, f.name`,
    access.values
  );
  const ids = funnels.rows.map((funnel) => funnel.id);
  const [stages, grants] = await Promise.all([
    query<Record<string, unknown> & { funnelId: string }>(
      `SELECT s.id, s.funnel_id AS "funnelId", s.name, s.color, s.sort_order AS "sortOrder", s.outcome
              ${director ? `, (SELECT count(*)::int FROM deals d WHERE d.stage_id = s.id) AS "dealCount"` : ""}
       FROM deal_stages s WHERE s.funnel_id = ANY($1::uuid[]) ORDER BY s.sort_order, s.name`,
      [ids]
    ),
    director
      ? query<{ funnelId: string; departmentId: string | null; userId: string | null }>(
        `SELECT funnel_id AS "funnelId", department_id AS "departmentId", user_id AS "userId"
         FROM deal_funnel_access WHERE funnel_id = ANY($1::uuid[])`,
        [ids]
      )
      : Promise.resolve({ rows: [] as Array<{ funnelId: string; departmentId: string | null; userId: string | null }> })
  ]);
  res.json({
    data: funnels.rows.map((funnel) => {
      const own = grants.rows.filter((grant) => grant.funnelId === funnel.id);
      return {
        id: funnel.id,
        name: funnel.name,
        sortOrder: funnel.sortOrder,
        stages: stages.rows.filter((stage) => stage.funnelId === funnel.id),
        ...(director ? {
          accessMode: funnel.accessMode,
          departmentIds: own.flatMap((grant) => grant.departmentId ? [grant.departmentId] : []),
          userIds: own.flatMap((grant) => grant.userId ? [grant.userId] : [])
        } : {})
      };
    })
  });
}));

funnelsRouter.post("/", directorOnlyConfig("FUNNEL_CREATE"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const input = funnelCreateSchema.parse(req.body);
  const accessMode = input.accessMode ?? "COMPANY";
  const id = await withConstraintErrors(() => transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`atlas-funnels:${auth.companyId}`]);
    const created = await client.query<{ id: string }>(
      `INSERT INTO deal_funnels (company_id, name, sort_order, access_mode)
       VALUES ($1, $2, (SELECT COALESCE(max(sort_order), 0) + 10 FROM deal_funnels WHERE company_id = $1), $3)
       RETURNING id`,
      [auth.companyId, input.name, accessMode]
    );
    const funnelId = created.rows[0]!.id;
    for (const [index, stage] of input.stages.entries()) {
      await client.query(
        `INSERT INTO deal_stages (company_id, funnel_id, name, color, sort_order, outcome) VALUES ($1,$2,$3,$4,$5,$6)`,
        [auth.companyId, funnelId, stage.name, stage.color, (index + 1) * 10, stage.outcome]
      );
    }
    if (accessMode === "RESTRICTED") await replaceGrants(client, auth, funnelId, input.departmentIds ?? [], input.userIds ?? []);
    return funnelId;
  }));
  await writeAudit(req, {
    auth, action: "FUNNEL_CREATED", entityType: "deal_funnel", entityId: id,
    metadata: { name: input.name, accessMode, stages: input.stages.length }
  });
  res.status(201).json({ data: { id } });
}));

funnelsRouter.patch("/:id", directorOnlyConfig("FUNNEL_UPDATE"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const input = funnelPatchSchema.parse(req.body);
  if (input.name === undefined && input.sortOrder === undefined) throw new ApiError(400, "NO_CHANGES", "No fields to update");
  await withConstraintErrors(() => transaction(async (client) => {
    await lockFunnel(client, auth, id);
    await client.query(
      `UPDATE deal_funnels SET name = COALESCE($2, name), sort_order = COALESCE($3, sort_order) WHERE id = $1`,
      [id, input.name ?? null, input.sortOrder ?? null]
    );
  }));
  await writeAudit(req, { auth, action: "FUNNEL_UPDATED", entityType: "deal_funnel", entityId: id, metadata: { fields: Object.keys(input) } });
  res.json({ data: { id } });
}));

funnelsRouter.delete("/:id", directorOnlyConfig("FUNNEL_DELETE"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const name = await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`atlas-funnels:${auth.companyId}`]);
    const funnel = await lockFunnel(client, auth, id);
    const deals = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM deals WHERE funnel_id = $1", [id]);
    if (deals.rows[0]!.count > 0) throw new ApiError(409, "FUNNEL_NOT_EMPTY", "Move or delete the funnel's deals first");
    const funnels = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM deal_funnels WHERE company_id = $1", [auth.companyId]);
    if (funnels.rows[0]!.count <= 1) throw new ApiError(409, "LAST_FUNNEL", "The company's last funnel cannot be deleted");
    await client.query("DELETE FROM deal_funnels WHERE id = $1", [id]);
    return funnel.name;
  });
  await writeAudit(req, { auth, action: "FUNNEL_DELETED", entityType: "deal_funnel", entityId: id, metadata: { name } });
  res.status(204).send();
}));

funnelsRouter.put("/:id/access", directorOnlyConfig("FUNNEL_ACCESS_UPDATE"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const input = accessInputSchema.parse(req.body);
  const previous = await transaction(async (client) => {
    const funnel = await lockFunnel(client, auth, id);
    const grants = await client.query<{ departmentId: string | null; userId: string | null }>(
      `SELECT department_id AS "departmentId", user_id AS "userId" FROM deal_funnel_access WHERE funnel_id = $1`,
      [id]
    );
    await client.query("UPDATE deal_funnels SET access_mode = $2 WHERE id = $1", [id, input.accessMode]);
    await replaceGrants(client, auth, id, input.accessMode === "RESTRICTED" ? input.departmentIds : [],
      input.accessMode === "RESTRICTED" ? input.userIds : []);
    return {
      accessMode: funnel.access_mode,
      departmentIds: grants.rows.flatMap((grant) => grant.departmentId ? [grant.departmentId] : []),
      userIds: grants.rows.flatMap((grant) => grant.userId ? [grant.userId] : [])
    };
  });
  const next = input.accessMode === "RESTRICTED"
    ? { accessMode: input.accessMode, departmentIds: unique(input.departmentIds), userIds: unique(input.userIds) }
    : { accessMode: input.accessMode, departmentIds: [], userIds: [] };
  await writeAudit(req, { auth, action: "FUNNEL_ACCESS_UPDATED", entityType: "deal_funnel", entityId: id, metadata: { previous, next } });
  res.json({ data: { id, ...next } });
}));

funnelsRouter.post("/:id/stages", directorOnlyConfig("STAGE_CREATE"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const input = stageInputSchema.parse(req.body);
  const stage = await withConstraintErrors(() => transaction(async (client) => {
    await lockFunnel(client, auth, id);
    const created = await client.query<{ id: string }>(
      `INSERT INTO deal_stages (company_id, funnel_id, name, color, sort_order, outcome)
       VALUES ($1, $2, $3, $4, (SELECT COALESCE(max(sort_order), 0) + 10 FROM deal_stages WHERE funnel_id = $2), $5)
       RETURNING id, funnel_id AS "funnelId", name, color, sort_order AS "sortOrder", outcome`,
      [auth.companyId, id, input.name, input.color, input.outcome]
    );
    return created.rows[0]!;
  }));
  await writeAudit(req, { auth, action: "DEAL_STAGE_CREATED", entityType: "deal_stage", entityId: stage.id, metadata: { funnelId: id, name: input.name } });
  res.status(201).json({ data: stage });
}));

funnelsRouter.put("/:id/stages/order", directorOnlyConfig("STAGE_REORDER"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const input = orderSchema.parse(req.body);
  await transaction(async (client) => {
    await lockFunnel(client, auth, id);
    const stages = await client.query<{ id: string }>("SELECT id FROM deal_stages WHERE funnel_id = $1", [id]);
    assertExactOrder(stages.rows.map((stage) => stage.id), input.stageIds);
    await client.query(
      `UPDATE deal_stages s SET sort_order = ordered.position * 10
       FROM unnest($2::uuid[]) WITH ORDINALITY AS ordered(id, position)
       WHERE s.id = ordered.id AND s.funnel_id = $1`,
      [id, input.stageIds]
    );
  });
  await writeAudit(req, { auth, action: "DEAL_STAGES_REORDERED", entityType: "deal_funnel", entityId: id, metadata: { stageIds: input.stageIds } });
  res.json({ data: { id, stageIds: input.stageIds } });
}));

funnelsRouter.patch("/:id/stages/:stageId", directorOnlyConfig("STAGE_UPDATE"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const stageId = idSchema.parse(req.params.stageId);
  const input = stagePatchSchema.parse(req.body);
  if (!Object.keys(input).length) throw new ApiError(400, "NO_CHANGES", "No fields to update");
  const stage = await withConstraintErrors(() => transaction(async (client) => {
    await lockFunnel(client, auth, id);
    const updated = await client.query<{ id: string }>(
      `UPDATE deal_stages SET name = COALESCE($3, name), color = COALESCE($4, color), outcome = COALESCE($5, outcome)
       WHERE id = $2 AND funnel_id = $1
       RETURNING id, funnel_id AS "funnelId", name, color, sort_order AS "sortOrder", outcome`,
      [id, stageId, input.name ?? null, input.color ?? null, input.outcome ?? null]
    );
    if (!updated.rows[0]) throw new ApiError(404, "STAGE_NOT_FOUND", "Stage not found");
    await assertFunnelHasOpenStage(client, id);
    return updated.rows[0];
  }));
  await writeAudit(req, { auth, action: "DEAL_STAGE_UPDATED", entityType: "deal_stage", entityId: stageId, metadata: { funnelId: id, fields: Object.keys(input) } });
  res.json({ data: stage });
}));

funnelsRouter.delete("/:id/stages/:stageId", directorOnlyConfig("STAGE_DELETE"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const stageId = idSchema.parse(req.params.stageId);
  const { moveToStageId } = z.object({ moveToStageId: z.string().uuid().optional() }).parse(req.query);
  const movedDeals = await withConstraintErrors(() => transaction(async (client) => {
    await lockFunnel(client, auth, id);
    const stages = await client.query<{ id: string }>("SELECT id FROM deal_stages WHERE funnel_id = $1", [id]);
    const stageIds = stages.rows.map((stage) => stage.id);
    if (!stageIds.includes(stageId)) throw new ApiError(404, "STAGE_NOT_FOUND", "Stage not found");
    if (stageIds.length === 1) throw new ApiError(409, "LAST_STAGE", "A funnel's last stage cannot be deleted");
    if (moveToStageId !== undefined && (moveToStageId === stageId || !stageIds.includes(moveToStageId))) {
      throw new ApiError(400, "INVALID_TARGET_STAGE", "Target stage must be another stage of the same funnel");
    }
    const deals = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM deals WHERE stage_id = $1", [stageId]);
    const count = deals.rows[0]!.count;
    if (count > 0 && !moveToStageId) {
      throw new ApiError(400, "TARGET_STAGE_REQUIRED", "Choose a stage to move this stage's deals to");
    }
    const moved = count > 0
      ? (await client.query("UPDATE deals SET stage_id = $2 WHERE stage_id = $1", [stageId, moveToStageId])).rowCount ?? 0
      : 0;
    await client.query("DELETE FROM deal_stages WHERE id = $1", [stageId]);
    await assertFunnelHasOpenStage(client, id);
    return moved;
  }));
  await writeAudit(req, {
    auth, action: "DEAL_STAGE_DELETED", entityType: "deal_stage", entityId: stageId,
    metadata: { funnelId: id, targetStageId: moveToStageId ?? null, movedDeals }
  });
  res.status(204).send();
}));

async function lockFunnel(client: PoolClient, auth: AuthContext, id: string): Promise<{ id: string; name: string; access_mode: string }> {
  const funnel = await client.query<{ id: string; name: string; access_mode: string }>(
    "SELECT id, name, access_mode FROM deal_funnels WHERE id = $1 AND company_id = $2 FOR UPDATE",
    [id, auth.companyId]
  );
  if (!funnel.rows[0]) throw new ApiError(404, "FUNNEL_NOT_FOUND", "Funnel not found");
  return funnel.rows[0];
}

async function assertFunnelHasOpenStage(client: PoolClient, funnelId: string): Promise<void> {
  const outcomes = await client.query<{ outcome: Outcome }>("SELECT outcome FROM deal_stages WHERE funnel_id = $1", [funnelId]);
  assertOpenStage(outcomes.rows.map((row) => row.outcome));
}

async function replaceGrants(client: PoolClient, auth: AuthContext, funnelId: string, departmentIds: string[], userIds: string[]): Promise<void> {
  const departments = unique(departmentIds);
  const users = unique(userIds);
  const [validDepartments, validUsers] = await Promise.all([
    client.query<{ count: number }>("SELECT count(*)::int AS count FROM departments WHERE company_id = $1 AND id = ANY($2::uuid[])", [auth.companyId, departments]),
    client.query<{ count: number }>("SELECT count(*)::int AS count FROM users WHERE company_id = $1 AND id = ANY($2::uuid[])", [auth.companyId, users])
  ]);
  if (validDepartments.rows[0]!.count !== departments.length || validUsers.rows[0]!.count !== users.length) {
    throw new ApiError(400, "INVALID_ACCESS_GRANT", "Every granted department and user must belong to the company");
  }
  await client.query("DELETE FROM deal_funnel_access WHERE funnel_id = $1", [funnelId]);
  await client.query(
    `INSERT INTO deal_funnel_access (funnel_id, department_id)
     SELECT $1, unnest($2::uuid[])`,
    [funnelId, departments]
  );
  await client.query(
    `INSERT INTO deal_funnel_access (funnel_id, user_id)
     SELECT $1, unnest($2::uuid[])`,
    [funnelId, users]
  );
}

async function withConstraintErrors<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    const constraint = error && typeof error === "object" && "constraint" in error ? String(error.constraint) : "";
    if (code === "23505" && constraint === "deal_funnels_company_name_unique") {
      throw new ApiError(409, "FUNNEL_NAME_TAKEN", "A funnel with this name already exists");
    }
    if (code === "23505" && constraint === "deal_stages_funnel_name_unique") {
      throw new ApiError(409, "STAGE_NAME_TAKEN", "A stage with this name already exists in the funnel");
    }
    if (code === "23503") {
      throw new ApiError(409, "CONFLICT_RETRY", "Deals changed while the stage was being deleted; try again");
    }
    throw error;
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
