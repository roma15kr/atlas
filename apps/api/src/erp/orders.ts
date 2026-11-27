/**
 * A deal's order in BPI: created with the same call b2b's checkout makes, retried without duplicates (each attempt
 * carries an `atlas:<row id>` marker in the comment), locked once created and re-created as a new order on change.
 */
import { writeAudit, writeAutomationAudit } from "../audit";
import { bpiManagerOf } from "../catalogue/bpiManagers";
import { createBpiOrder, recentBpiOrders } from "../catalogue/bpi";
import { query, transaction } from "../db";
import { ApiError } from "../errors";
import { text } from "../i18n";
import { notify } from "../notifications/notify";
import type { AuthContext } from "../types";
import type { Request } from "express";

/** Pauses between retries, in minutes; after the last one the pause stays at an hour, for 24 hours in all. */
const PAUSES = [1, 2, 4, 8, 15, 30, 60];
const GIVE_UP_MS = 24 * 60 * 60 * 1000;

export interface DealOrderView {
  id: string; bpiOrderId: number | null; replacesOrderId: number | null; status: "CREATING" | "SENT" | "FAILED";
  attempts: number; lastError: string | null; sentBy: string | null; sentByName: string | null; createdAt: string; sentAt: string | null;
}

export const ORDER_COLUMNS = `o.id, o.bpi_order_id AS "bpiOrderId", o.replaces_order_id AS "replacesOrderId", o.status, o.attempts,
  o.last_error AS "lastError", o.sent_by AS "sentBy", u.full_name AS "sentByName", o.created_at AS "createdAt", o.sent_at AS "sentAt"`;

const bpiDate = (date: Date) => date.toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit", year: "numeric" });

interface DealForOrder {
  id: string; company_id: string; title: string; client_company: string | null; client_name: string | null; client_phone: string | null; client_email: string | null;
  products_locked: boolean;
}

/** Creates the deal's order in BPI (the caller has already checked the deal is in scope). */
export async function createDealOrder(req: Request, auth: AuthContext, dealId: string): Promise<{ status: number; order: DealOrderView }> {
  const deal = (await query<DealForOrder>(
    `SELECT d.id, d.company_id, d.title, d.products_locked, c.company_name AS client_company, c.name AS client_name, c.phone AS client_phone, c.email AS client_email
     FROM deals d LEFT JOIN clients c ON c.id = d.client_id WHERE d.id = $1`, [dealId])).rows[0]!;
  const lines = (await query<{ bpi_product_id: number; name: string; code: string; by_box: boolean; quantity: number; unit_price: string }>(
    "SELECT bpi_product_id, name, code, by_box, quantity, unit_price FROM deal_products WHERE deal_id = $1 ORDER BY position", [dealId])).rows;
  const refuse = async (status: number, code: string, message: string): Promise<never> => {
    await writeAudit(req, { auth, action: "DEAL_ORDER_DENIED", entityType: "deal", entityId: dealId, metadata: { reason: code } });
    throw new ApiError(status, code, message);
  };
  if (deal.products_locked) await refuse(409, "DEAL_ORDER_LOCKED", "The order is already created; unlock it to change it");
  if (!lines.length) await refuse(409, "DEAL_PRODUCTS_REQUIRED", "Add products before creating the order");
  if (!deal.client_company && !deal.client_name) await refuse(409, "DEAL_CLIENT_REQUIRED", "The deal needs a client");
  const managerId = await bpiManagerOf(auth.userId);
  if (!managerId) await refuse(409, "BPI_MANAGER_REQUIRED", "A director has to choose your BPI manager first");
  const previous = (await query<{ bpi_order_id: number }>(
    "SELECT bpi_order_id FROM deal_orders WHERE deal_id = $1 AND status = 'SENT' ORDER BY sent_at DESC LIMIT 1", [dealId])).rows[0]?.bpi_order_id ?? null;

  const total = lines.reduce((sum, line) => sum + Number(line.unit_price) * line.quantity, 0);
  const orderId = (await query<{ id: string }>("SELECT gen_random_uuid() AS id")).rows[0]!.id;
  const comment = [`Quorfield: угода «${deal.title}»`, previous ? `замінює № ${previous}` : null, `atlas:${orderId}`].filter(Boolean).join(" · ");
  const body = {
    name: deal.client_name ?? deal.client_company, user_id: managerId, manager_id: managerId,
    phone: deal.client_phone ?? "", organization: deal.client_company ?? deal.client_name, delivery: "",
    payment_status: "Не оплачено", execution_status: "Нове замовлення",
    goods: lines.map((line) => ({
      id: line.bpi_product_id, art: line.code, name: line.name, url: "", image: "", number: line.quantity,
      price: Math.round(Number(line.unit_price)), power: 0, length: 0, box: line.by_box
    })),
    sum_total: Math.round(total), date: bpiDate(new Date()), town: "", address: "", sum_np: "0", comment
  };
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO deal_orders (id, company_id, deal_id, replaces_order_id, status, request, sent_by) VALUES ($1, $2, $3, $4, 'CREATING', $5::jsonb, $6)`,
      [orderId, deal.company_id, dealId, previous, JSON.stringify(body), auth.userId]);
    await client.query("UPDATE deals SET products_locked = true WHERE id = $1", [dealId]);
  });
  const outcome = await attempt(orderId);
  await writeAudit(req, { auth, action: outcome === "SENT" ? "DEAL_ORDER_SENT" : "DEAL_ORDER_QUEUED", entityType: "deal", entityId: dealId,
    metadata: { orderId, bpiOrderId: (await orderView(orderId)).bpiOrderId } });
  return { status: outcome === "SENT" ? 200 : 202, order: await orderView(orderId) };
}

export async function orderView(orderId: string): Promise<DealOrderView> {
  return (await query<DealOrderView>(`SELECT ${ORDER_COLUMNS} FROM deal_orders o LEFT JOIN users u ON u.id = o.sent_by WHERE o.id = $1`, [orderId])).rows[0]!;
}

/**
 * One try at a CREATING order. A previous try may have timed out after BPI created the order, so from the second try
 * on, BPI's recent orders are searched for this row's marker first and an existing order is adopted.
 */
async function attempt(orderId: string): Promise<"SENT" | "CREATING" | "FAILED"> {
  const row = (await query<{ request: Record<string, unknown>; attempts: number; created_at: Date; deal_id: string; company_id: string; sent_by: string | null }>(
    "UPDATE deal_orders SET attempts = attempts + 1 WHERE id = $1 AND status = 'CREATING' RETURNING request, attempts, created_at, deal_id, company_id, sent_by", [orderId])).rows[0];
  if (!row) return "SENT";
  let bpiOrderId: number | null = null;
  let error: string | null = null;
  try {
    if (row.attempts > 1) bpiOrderId = (await recentBpiOrders()).find((order) => typeof order.comment === "string" && order.comment.includes(`atlas:${orderId}`))?.id ?? null;
    bpiOrderId ??= await createBpiOrder(row.request);
  } catch (reason) { error = (reason as Error).message.slice(0, 200); }
  if (bpiOrderId) {
    await query("UPDATE deal_orders SET status = 'SENT', bpi_order_id = $2, sent_at = now(), last_error = NULL WHERE id = $1", [orderId, bpiOrderId]);
    return "SENT";
  }
  if (Date.now() - new Date(row.created_at).getTime() >= GIVE_UP_MS) {
    await query("UPDATE deal_orders SET status = 'FAILED', last_error = $2 WHERE id = $1", [orderId, error]);
    await writeAutomationAudit(row.company_id, { action: "DEAL_ORDER_FAILED", entityType: "deal", entityId: row.deal_id, metadata: { orderId } });
    if (row.sent_by) {
      const title = (await query<{ title: string }>("SELECT title FROM deals WHERE id = $1", [row.deal_id])).rows[0]?.title ?? "";
      await notify(row.company_id, [row.sent_by], null, {
        kind: "DEAL_ORDER_FAILED", title: text("order.failedTitle"), body: text("order.failedBody", { deal: title }),
        link: `/sales?deal=${row.deal_id}`, entityType: "deal", entityId: row.deal_id
      });
    }
    return "FAILED";
  }
  const pause = PAUSES[Math.min(row.attempts - 1, PAUSES.length - 1)]!;
  await query("UPDATE deal_orders SET last_error = $2, next_attempt_at = now() + make_interval(mins => $3) WHERE id = $1", [orderId, error, pause]);
  return "CREATING";
}

/** The scheduler step: due orders get another try. */
export async function retryDealOrders(): Promise<{ sent: number; failed: number }> {
  const due = await query<{ id: string }>("SELECT id FROM deal_orders WHERE status = 'CREATING' AND next_attempt_at <= now() ORDER BY next_attempt_at LIMIT 20");
  let sent = 0, failed = 0;
  for (const { id } of due.rows) {
    const outcome = await attempt(id);
    if (outcome === "SENT") sent += 1; else if (outcome === "FAILED") failed += 1;
  }
  return { sent, failed };
}

/** «Спробувати ще» for a FAILED order: it gets a fresh day of retries. */
export async function retryFailedOrder(orderId: string): Promise<"SENT" | "CREATING" | "FAILED"> {
  await query("UPDATE deal_orders SET status = 'CREATING', created_at = now(), next_attempt_at = now() WHERE id = $1 AND status = 'FAILED'", [orderId]);
  return attempt(orderId);
}
