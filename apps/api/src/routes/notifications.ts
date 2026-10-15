import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { query } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { NOTIFICATION_COLUMNS } from "../notifications/notify";

/** Every user reads and marks only their own notifications; another user's id answers 404. */
export const notificationsRouter = Router();

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.string().datetime().optional(),
  unread: z.enum(["true", "false"]).optional()
});

notificationsRouter.get("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const filters = listQuery.parse(req.query);
  const values: unknown[] = [auth.userId];
  const clauses = ["user_id = $1"];
  if (filters.before) { values.push(filters.before); clauses.push(`created_at < $${values.length}`); }
  if (filters.unread === "true") clauses.push("read_at IS NULL");
  values.push(filters.limit);
  const [rows, unread] = await Promise.all([
    query(`SELECT ${NOTIFICATION_COLUMNS} FROM notifications WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT $${values.length}`, values),
    query<{ count: number }>("SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL", [auth.userId])
  ]);
  res.json({ data: rows.rows, meta: { unreadCount: unread.rows[0]?.count ?? 0 } });
}));

notificationsRouter.post("/read-all", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  await query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [auth.userId]);
  res.json({ data: { unreadCount: 0 } });
}));

notificationsRouter.post("/:id/read", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = z.string().uuid().parse(req.params.id);
  const result = await query(
    `UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2 RETURNING ${NOTIFICATION_COLUMNS}`, [id, auth.userId]);
  if (!result.rows[0]) throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "Notification not found");
  res.json({ data: result.rows[0] });
}));
