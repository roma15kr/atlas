import webPush from "web-push";
import { config } from "../config";
import { query } from "../db";
import { NOTIFICATION_GROUPS, setNotificationDelivery, type NotificationRow } from "./notify";

export interface PushTarget { endpoint: string; keys: { p256dh: string; auth: string } }
/** Sends one push; resolves the HTTP status. Replaced in tests. */
export type PushSender = (target: PushTarget, payload: string) => Promise<number>;

const MAX_FAILURES = 5;

export const pushEnabled = (): boolean => Boolean(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY);

/** Options for every push: a day to deliver, high urgency (a locked, idle Android phone otherwise holds it), VAPID keys. */
export const pushOptions = () => ({
  TTL: 24 * 60 * 60,
  urgency: "high" as const,
  vapidDetails: { subject: config.VAPID_SUBJECT, publicKey: config.VAPID_PUBLIC_KEY!, privateKey: config.VAPID_PRIVATE_KEY! }
});

let sender: PushSender = async (target, payload) => (await webPush.sendNotification(target, payload, pushOptions())).statusCode;
export function setPushSender(next: PushSender): void { sender = next; }

const groupColumn = { tasks: "push_tasks", chat: "push_chat", telegram: "push_telegram", alerts: "push_alerts" } as const;

interface SubscriptionRow { id: string; endpoint: string; p256dh: string; auth: string }

/** Pushes one notification to every subscription of its user, if their preference allows the group. */
async function pushOne(row: NotificationRow): Promise<void> {
  const column = groupColumn[NOTIFICATION_GROUPS[row.kind]];
  const subscriptions = await query<SubscriptionRow>(
    `SELECT s.id, s.endpoint, s.p256dh, s.auth FROM push_subscriptions s
     LEFT JOIN notification_preferences p ON p.user_id = s.user_id
     WHERE s.user_id = $1 AND COALESCE(p.${column}, true)`, [row.userId]);
  const payload = JSON.stringify({ id: row.id, title: row.title, body: row.body ?? "", link: row.link, tag: row.entityId ? `${row.kind}:${row.entityId}` : row.id });
  await Promise.all(subscriptions.rows.map((subscription) => sendTo(subscription, payload)));
}

/** A gone subscription (404/410) is deleted; one that keeps failing is deleted after five attempts. */
export async function sendTo(subscription: SubscriptionRow, payload: string): Promise<boolean> {
  let status: number;
  try { status = await sender({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload); }
  catch (error) { status = (error as { statusCode?: number }).statusCode ?? 0; }
  if (status >= 200 && status < 300) {
    await query("UPDATE push_subscriptions SET last_success_at = now(), failures = 0 WHERE id = $1", [subscription.id]);
    return true;
  }
  if (status === 404 || status === 410) await query("DELETE FROM push_subscriptions WHERE id = $1", [subscription.id]);
  else await query(`DELETE FROM push_subscriptions WHERE id = $1 AND failures + 1 >= ${MAX_FAILURES}`, [subscription.id])
    .then((deleted) => deleted.rowCount ? undefined : query("UPDATE push_subscriptions SET failures = failures + 1 WHERE id = $1", [subscription.id]));
  return false;
}

export async function deliverPush(rows: NotificationRow[]): Promise<void> {
  if (!pushEnabled()) return;
  for (const row of rows) await pushOne(row);
}

setNotificationDelivery(deliverPush);
