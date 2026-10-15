import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { query } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { writeAudit } from "../audit";
import { NOTIFICATION_COLUMNS } from "../notifications/notify";
import { pushEnabled, sendTo } from "../notifications/push";
import { config } from "../config";

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

const preferences = z.object({ tasks: z.boolean(), chat: z.boolean(), telegram: z.boolean(), alerts: z.boolean() }).partial().strict();
const PREFERENCES_SELECT = `SELECT COALESCE(p.push_tasks, true) AS tasks, COALESCE(p.push_chat, true) AS chat,
  COALESCE(p.push_telegram, true) AS telegram, COALESCE(p.push_alerts, true) AS alerts
  FROM (SELECT $1::uuid AS user_id) me LEFT JOIN notification_preferences p ON p.user_id = me.user_id`;

notificationsRouter.get("/preferences", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  res.json({ data: (await query(PREFERENCES_SELECT, [auth.userId])).rows[0] });
}));

notificationsRouter.patch("/preferences", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const input = preferences.parse(req.body);
  const fields = Object.keys(input) as Array<keyof typeof input>;
  if (!fields.length) throw new ApiError(400, "NO_CHANGES", "No fields to update");
  const columns = { tasks: "push_tasks", chat: "push_chat", telegram: "push_telegram", alerts: "push_alerts" } as const;
  await query(
    `INSERT INTO notification_preferences (user_id, ${fields.map((field) => columns[field]).join(", ")}) VALUES ($1, ${fields.map((_, index) => `$${index + 2}`).join(", ")})
     ON CONFLICT (user_id) DO UPDATE SET ${fields.map((field) => `${columns[field]} = EXCLUDED.${columns[field]}`).join(", ")}, updated_at = now()`,
    [auth.userId, ...fields.map((field) => input[field])]);
  await writeAudit(req, { auth, action: "NOTIFICATION_PREFERENCES_UPDATED", entityType: "user", entityId: auth.userId, metadata: { fields } });
  res.json({ data: (await query(PREFERENCES_SELECT, [auth.userId])).rows[0] });
}));

/** Desktop notifications: "disabled" until the server has a key pair. */
notificationsRouter.get("/push/config", asyncHandler(async (req, res) => {
  requireAuth(req);
  res.json({ data: pushEnabled() ? { enabled: true, publicKey: config.VAPID_PUBLIC_KEY } : { enabled: false, publicKey: null } });
}));

const subscriptionInput = z.object({
  endpoint: z.string().url().max(1000).refine((value) => value.startsWith("https://"), "must be https"),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) })
});

/** A browser's subscription belongs to whoever registers it last (one browser, one person signed in). */
notificationsRouter.post("/push/subscriptions", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  if (!pushEnabled()) throw new ApiError(409, "PUSH_DISABLED", "Desktop notifications are not configured on this server");
  const input = subscriptionInput.parse(req.body);
  const saved = await query<{ id: string }>(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent, failures = 0
     RETURNING id`,
    [auth.userId, input.endpoint, input.keys.p256dh, input.keys.auth, req.get("user-agent")?.slice(0, 300) ?? null]);
  await writeAudit(req, { auth, action: "PUSH_SUBSCRIBED", entityType: "push_subscription", entityId: saved.rows[0]!.id });
  res.status(201).json({ data: { id: saved.rows[0]!.id } });
}));

notificationsRouter.delete("/push/subscriptions", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const { endpoint } = z.object({ endpoint: z.string().url().max(1000) }).parse(req.body);
  const deleted = await query<{ id: string }>("DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2 RETURNING id", [endpoint, auth.userId]);
  if (deleted.rows[0]) await writeAudit(req, { auth, action: "PUSH_UNSUBSCRIBED", entityType: "push_subscription", entityId: deleted.rows[0].id });
  res.status(204).send();
}));

/** Sends a test pop-up to every browser of the caller; says how many accepted it. */
notificationsRouter.post("/push/test", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  if (!pushEnabled()) throw new ApiError(409, "PUSH_DISABLED", "Desktop notifications are not configured on this server");
  const subscriptions = await query<{ id: string; endpoint: string; p256dh: string; auth: string }>(
    "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1", [auth.userId]);
  const payload = JSON.stringify({ id: `test-${Date.now()}`, title: "Atlas: проверка уведомлений", body: "Так будут выглядеть уведомления на рабочем столе", link: "/profile#notifications", tag: "test" });
  const results = await Promise.all(subscriptions.rows.map((subscription) => sendTo(subscription, payload)));
  res.json({ data: { browsers: subscriptions.rows.length, delivered: results.filter(Boolean).length } });
}));

notificationsRouter.post("/:id/read", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = z.string().uuid().parse(req.params.id);
  const result = await query(
    `UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2 RETURNING ${NOTIFICATION_COLUMNS}`, [id, auth.userId]);
  if (!result.rows[0]) throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "Notification not found");
  res.json({ data: result.rows[0] });
}));
