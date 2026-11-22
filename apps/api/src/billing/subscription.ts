/** The company's subscription as Stripe last reported it, what it includes, paid seats and overdue reminders. */
import { writeAutomationAudit } from "../audit";
import { query } from "../db";
import { text } from "../i18n";
import { notify } from "../notifications/notify";
import { emitToUsers } from "../realtime";
import { billingConfigured, planOfPrice, stripeRequest, type Period, type Plan } from "./stripe";

export interface Subscription {
  plan: Plan | null; period: Period | null; status: string | null; quantity: number | null;
  currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; paymentFailedAt: string | null;
}

interface SubscriptionRow {
  company_id: string; stripe_customer_id: string; stripe_subscription_id: string | null; plan: Plan | null; period: Period | null;
  status: string | null; quantity: number | null; current_period_end: Date | null; cancel_at_period_end: boolean; payment_failed_at: Date | null;
}

/** Stripe statuses after which a subscription no longer gives its tariff's features. */
const ENDED = ["canceled", "incomplete_expired"];

export async function subscriptionRow(companyId: string): Promise<SubscriptionRow | null> {
  return (await query<SubscriptionRow>("SELECT * FROM company_subscriptions WHERE company_id = $1", [companyId])).rows[0] ?? null;
}

/** The subscription for the screen, or null before the first payment. */
export async function subscriptionOf(companyId: string): Promise<Subscription | null> {
  const row = await subscriptionRow(companyId);
  if (!row?.stripe_subscription_id) return null;
  return {
    plan: row.plan, period: row.period, status: row.status, quantity: row.quantity,
    currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end).toISOString() : null,
    cancelAtPeriodEnd: row.cancel_at_period_end, paymentFailedAt: row.payment_failed_at ? new Date(row.payment_failed_at).toISOString() : null
  };
}

/**
 * Whether AI features are on for a company (as a SQL predicate over a company id column): on before the first
 * subscription, on with «Стандарт + AI» (overdue included: reminders only), off with «Стандарт» or once ended.
 */
export const AI_ALLOWED_SQL = (companyColumn: string) => `NOT EXISTS (
  SELECT 1 FROM company_subscriptions cs WHERE cs.company_id = ${companyColumn} AND cs.stripe_subscription_id IS NOT NULL
    AND (cs.plan IS DISTINCT FROM 'STANDARD_AI' OR cs.status = ANY(ARRAY['${ENDED.join("','")}'])))`;

export async function aiIncluded(companyId: string): Promise<boolean> {
  return Boolean((await query<{ allowed: boolean }>(`SELECT ${AI_ALLOWED_SQL("$1::uuid")} AS allowed`, [companyId])).rows[0]?.allowed);
}

export async function activeUserCount(companyId: string): Promise<number> {
  return (await query<{ count: number }>("SELECT count(*)::int AS count FROM users WHERE company_id = $1 AND status = 'ACTIVE'", [companyId])).rows[0]?.count ?? 0;
}

async function directorsOf(companyId: string): Promise<string[]> {
  return (await query<{ id: string }>("SELECT id FROM users WHERE company_id = $1 AND role = 'DIRECTOR' AND status = 'ACTIVE'", [companyId])).rows.map((row) => row.id);
}

/** Tells open «Тариф і оплата» screens that the subscription changed. */
export async function announceBilling(companyId: string): Promise<void> {
  emitToUsers(await directorsOf(companyId), "billing:changed", { subscription: await subscriptionOf(companyId) });
}

interface StripeSubscription {
  id: string; customer: string; status: string; cancel_at_period_end: boolean; current_period_end?: number;
  items: { data: Array<{ id: string; quantity?: number; price: { id: string }; current_period_end?: number }> };
  metadata?: Record<string, string>;
}

/** Stores a subscription object from Stripe for the company it belongs to (by customer id, or metadata on first sight). */
export async function storeSubscription(subscription: StripeSubscription): Promise<string | null> {
  const item = subscription.items.data[0];
  const mapped = item ? planOfPrice(item.price.id) : null;
  const periodEnd = subscription.current_period_end ?? item?.current_period_end ?? null;
  const updated = await query<{ company_id: string }>(
    `UPDATE company_subscriptions SET stripe_subscription_id = $2, plan = $3, period = $4, status = $5, quantity = $6,
       current_period_end = to_timestamp($7), cancel_at_period_end = $8, updated_at = now()
     WHERE stripe_customer_id = $1 OR ($9::uuid IS NOT NULL AND company_id = $9::uuid) RETURNING company_id`,
    [subscription.customer, subscription.id, mapped?.plan ?? null, mapped?.period ?? null, subscription.status, item?.quantity ?? null,
      periodEnd, subscription.cancel_at_period_end, subscription.metadata?.companyId ?? null]);
  const companyId = updated.rows[0]?.company_id ?? null;
  if (companyId) {
    await writeAutomationAudit(companyId, { action: "BILLING_SUBSCRIPTION_CHANGED", entityType: "subscription", entityId: null,
      metadata: { plan: mapped?.plan ?? null, period: mapped?.period ?? null, status: subscription.status, quantity: item?.quantity ?? null } });
    await announceBilling(companyId);
  }
  return companyId;
}

/**
 * Keeps the paid quantity equal to the number of active users. The difference goes on the next invoice
 * (`create_prorations`); Atlas never charges straight away. Safe to call often: it only writes when they differ.
 */
export async function syncSeats(companyId: string): Promise<boolean> {
  if (!billingConfigured()) return false;
  const row = await subscriptionRow(companyId);
  if (!row?.stripe_subscription_id || !row.status || ENDED.includes(row.status)) return false;
  const active = Math.max(1, await activeUserCount(companyId));
  if (row.quantity === active) return false;
  const subscription = await stripeRequest<StripeSubscription>("GET", `/v1/subscriptions/${row.stripe_subscription_id}`);
  const item = subscription.items.data[0];
  if (!item) return false;
  await stripeRequest("POST", `/v1/subscriptions/${row.stripe_subscription_id}`, {
    items: [{ id: item.id, quantity: active }], proration_behavior: "create_prorations"
  });
  await query("UPDATE company_subscriptions SET quantity = $2, updated_at = now() WHERE company_id = $1", [companyId, active]);
  await writeAutomationAudit(companyId, { action: "BILLING_SEATS_UPDATED", entityType: "subscription", entityId: null, metadata: { from: row.quantity, to: active } });
  await announceBilling(companyId);
  return true;
}

/** Called after a user is added, disabled or re-enabled; never fails the request that caused it. */
export function syncSeatsLater(companyId: string): void {
  void syncSeats(companyId).catch((error) => console.error("Seat sync failed", error));
}

/** Every subscribed company's seats, as a safety net for missed calls and provider outages. */
export async function syncAllSeats(): Promise<number> {
  if (!billingConfigured()) return 0;
  const companies = await query<{ company_id: string }>("SELECT company_id FROM company_subscriptions WHERE stripe_subscription_id IS NOT NULL");
  let changed = 0;
  for (const { company_id } of companies.rows) {
    try { if (await syncSeats(company_id)) changed += 1; } catch (error) { console.error("Seat sync failed", error); }
  }
  return changed;
}

/** Directors hear about a failed charge at once and every 3 days until an invoice is paid. Nobody loses access. */
export async function remindDirectors(companyId: string): Promise<void> {
  const row = await subscriptionRow(companyId);
  const plan = text(row?.plan === "STANDARD_AI" ? "billing.plan.STANDARD_AI" : "billing.plan.STANDARD");
  await notify(companyId, await directorsOf(companyId), null, {
    kind: "BILLING_PAYMENT_FAILED", title: text("billing.failedTitle"), body: text("billing.failedBody", { plan }),
    link: "/settings/billing", entityType: "subscription", entityId: null, collapseKey: "billing:payment-failed"
  });
  await query("UPDATE company_subscriptions SET last_reminder_at = now() WHERE company_id = $1", [companyId]);
}

export async function remindOverduePayments(now = new Date()): Promise<number> {
  const due = await query<{ company_id: string }>(
    `SELECT company_id FROM company_subscriptions
     WHERE payment_failed_at IS NOT NULL AND (last_reminder_at IS NULL OR last_reminder_at <= $1::timestamptz - interval '3 days')`, [now]);
  for (const { company_id } of due.rows) await remindDirectors(company_id);
  return due.rowCount ?? 0;
}

/** The scheduler step: seats, then reminders. */
export async function runBilling(): Promise<{ seats: number; reminders: number }> {
  return { seats: await syncAllSeats(), reminders: await remindOverduePayments() };
}
