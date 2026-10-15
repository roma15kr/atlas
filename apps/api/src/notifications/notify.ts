import { query } from "../db";
import { emitToUsers } from "../realtime";
import { plainPreview } from "./preview";

export const NOTIFICATION_GROUPS = {
  TASK_ASSIGNED: "tasks", TASK_COMMENTED: "tasks", TASK_DUE: "tasks", TASK_OVERDUE: "tasks",
  CHAT_DIRECT: "chat", CHAT_MENTION: "chat",
  TELEGRAM_MESSAGE: "telegram",
  ALERT_CREATED: "alerts", DEAL_ASSIGNED: "alerts", CLIENT_ASSIGNED: "alerts"
} as const;
export type NotificationKind = keyof typeof NOTIFICATION_GROUPS;
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[NotificationKind];

export interface NotificationInput {
  kind: NotificationKind;
  title: string;
  /** Formatted text is reduced to a one-line plain preview. */
  body?: string | null;
  /** An in-app path such as `/tasks?task=<id>`. */
  link: string;
  entityType?: string;
  entityId?: string | null;
  /** An unread notification with the same key is updated instead of adding another. */
  collapseKey?: string;
}

export interface NotificationRow {
  id: string; userId: string; kind: NotificationKind; title: string; body: string | null; link: string;
  entityType: string | null; entityId: string | null; createdAt: string; readAt: string | null;
}

export const NOTIFICATION_COLUMNS = `id, user_id AS "userId", kind, title, body, link, entity_type AS "entityType",
  entity_id AS "entityId", created_at AS "createdAt", read_at AS "readAt"`;

type Delivery = (rows: NotificationRow[]) => Promise<void>;
let deliver: Delivery = async () => undefined;
/** Desktop push plugs in here, so creating a notification never waits for the push services. */
export function setNotificationDelivery(next: Delivery): void { deliver = next; }

/**
 * Notifies `recipients` (already limited by the caller to people who may open the item), never the actor and
 * never inactive or other-company users. Failures are logged and never fail the request that caused them.
 */
export async function notify(companyId: string, recipients: Iterable<string>, actorId: string | null, input: NotificationInput): Promise<NotificationRow[]> {
  try {
    const wanted = [...new Set(recipients)].filter((id) => id && id !== actorId);
    if (!wanted.length) return [];
    const active = await query<{ id: string }>(
      "SELECT id FROM users WHERE id = ANY($1::uuid[]) AND company_id = $2 AND status = 'ACTIVE'", [wanted, companyId]);
    const body = input.body ? plainPreview(input.body) || null : null;
    const rows: NotificationRow[] = [];
    for (const { id: userId } of active.rows) {
      const values = [companyId, userId, input.kind, input.title, body, input.link, input.entityType ?? null, input.entityId ?? null, input.collapseKey ?? null];
      const updated = input.collapseKey ? await query<NotificationRow>(
        `UPDATE notifications SET kind = $3, title = $4, body = $5, link = $6, entity_type = $7, entity_id = $8, created_at = now()
         WHERE company_id = $1 AND user_id = $2 AND collapse_key = $9 AND read_at IS NULL RETURNING ${NOTIFICATION_COLUMNS}`, values) : null;
      const row = updated?.rows[0] ?? (await query<NotificationRow>(
        `INSERT INTO notifications (company_id, user_id, kind, title, body, link, entity_type, entity_id, collapse_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${NOTIFICATION_COLUMNS}`, values)).rows[0]!;
      rows.push(row);
      emitToUsers([userId], "notification:new", row);
    }
    void deliver(rows).catch((error) => console.error("Notification delivery failed", error));
    return rows;
  } catch (error) {
    console.error(`Notification ${input.kind} failed`, error);
    return [];
  }
}
