import type { Request, Response } from "express";
import { config } from "../config";
import { query } from "../db";
import { announceBilling, remindDirectors, storeSubscription } from "./subscription";
import { verifyStripeSignature } from "./stripe";

interface StripeEvent { id: string; type: string; data: { object: Record<string, unknown> } }

/**
 * Stripe's webhook: trusts nothing but the signature, handles each event id once, and acknowledges events it doesn't
 * use. Mounted with the raw body, before the JSON parser.
 */
export async function stripeWebhook(req: Request, res: Response): Promise<void> {
  const payload = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  if (!config.STRIPE_WEBHOOK_SECRET || !verifyStripeSignature(payload, req.get("stripe-signature"), config.STRIPE_WEBHOOK_SECRET)) {
    res.status(400).json({ error: { code: "INVALID_SIGNATURE", message: "Invalid signature" } });
    return;
  }
  let event: StripeEvent;
  try { event = JSON.parse(payload.toString("utf8")) as StripeEvent; } catch {
    res.status(400).json({ error: { code: "INVALID_PAYLOAD", message: "Invalid payload" } });
    return;
  }
  const fresh = await query("INSERT INTO stripe_events (id, type) VALUES ($1, $2) ON CONFLICT DO NOTHING", [event.id, event.type]);
  if (!fresh.rowCount) { res.json({ received: true, duplicate: true }); return; }
  try {
    await handle(event);
  } catch (error) {
    // Let Stripe retry: forget the event so the next delivery is handled.
    await query("DELETE FROM stripe_events WHERE id = $1", [event.id]);
    throw error;
  }
  res.json({ received: true });
}

async function handle(event: StripeEvent): Promise<void> {
  const object = event.data.object;
  switch (event.type) {
    case "checkout.session.completed": {
      const companyId = typeof object.client_reference_id === "string" ? object.client_reference_id : null;
      if (companyId && typeof object.subscription === "string") {
        await query("UPDATE company_subscriptions SET stripe_subscription_id = $2, updated_at = now() WHERE company_id = $1 AND stripe_customer_id = $3",
          [companyId, object.subscription, object.customer]);
        await announceBilling(companyId);
      }
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await storeSubscription(object as never);
      return;
    case "invoice.payment_failed": {
      const updated = await query<{ company_id: string }>(
        "UPDATE company_subscriptions SET payment_failed_at = COALESCE(payment_failed_at, now()), updated_at = now() WHERE stripe_customer_id = $1 RETURNING company_id",
        [object.customer]);
      const companyId = updated.rows[0]?.company_id;
      if (companyId) { await remindDirectors(companyId); await announceBilling(companyId); }
      return;
    }
    case "invoice.paid": {
      const updated = await query<{ company_id: string }>(
        "UPDATE company_subscriptions SET payment_failed_at = NULL, last_reminder_at = NULL, updated_at = now() WHERE stripe_customer_id = $1 RETURNING company_id",
        [object.customer]);
      if (updated.rows[0]) await announceBilling(updated.rows[0].company_id);
      return;
    }
    default:
      return;
  }
}
