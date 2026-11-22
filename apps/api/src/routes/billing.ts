import { Router, type Request } from "express";
import { z } from "zod";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { activeUserCount, aiIncluded, subscriptionOf, subscriptionRow } from "../billing/subscription";
import { billingConfigured, PERIODS, PLANS, priceIds, stripeRequest, type Period, type Plan } from "../billing/stripe";
import { config } from "../config";
import { query } from "../db";
import { ApiError, asyncHandler } from "../errors";
import type { AuthContext } from "../types";

/** Tariffs and payments: everything but `features` is for directors only. */
export const billingRouter = Router();

async function requireDirector(req: Request): Promise<AuthContext> {
  const auth = requireAuth(req);
  if (auth.role !== "DIRECTOR") {
    await writeAudit(req, { auth, action: "BILLING_ACCESS_DENIED", entityType: "company", entityId: auth.companyId });
    throw new ApiError(403, "DIRECTOR_ONLY", "Only a director can manage the tariff");
  }
  return auth;
}

interface PlanPrice { plan: Plan; period: Period; unitAmount: number; currency: string }
let priceCache: { at: number; prices: PlanPrice[] } | null = null;

/** The four prices as Stripe will charge them (cached for an hour), so the screen shows exactly what is charged. */
async function planPrices(): Promise<PlanPrice[]> {
  if (priceCache && Date.now() - priceCache.at < 3_600_000) return priceCache.prices;
  const prices: PlanPrice[] = [];
  for (const plan of PLANS) for (const period of PERIODS) {
    const price = await stripeRequest<{ unit_amount: number; currency: string }>("GET", `/v1/prices/${priceIds()[`${plan}:${period}`]}`);
    prices.push({ plan, period, unitAmount: price.unit_amount, currency: price.currency.toUpperCase() });
  }
  priceCache = { at: Date.now(), prices };
  return prices;
}
export function forgetPriceCache(): void { priceCache = null; }

/** Whether this company's tariff includes AI; any signed-in user may ask (the AI dialog uses it). */
billingRouter.get("/features", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  res.json({ data: { ai: await aiIncluded(auth.companyId) } });
}));

billingRouter.get("/", asyncHandler(async (req, res) => {
  const auth = await requireDirector(req);
  const configured = billingConfigured();
  res.json({ data: {
    configured,
    activeUsers: await activeUserCount(auth.companyId),
    plans: configured ? await planPrices() : [],
    subscription: await subscriptionOf(auth.companyId)
  } });
}));

const appUrl = (req: Request) => `${req.protocol}://${req.get("host")}`;

/** The company's Stripe customer, created on the first checkout. */
async function customerOf(auth: AuthContext): Promise<string> {
  const existing = await subscriptionRow(auth.companyId);
  if (existing) return existing.stripe_customer_id;
  const company = (await query<{ name: string; email: string | null }>(
    "SELECT c.name, u.contact_email AS email FROM companies c JOIN users u ON u.id = $2 WHERE c.id = $1", [auth.companyId, auth.userId])).rows[0];
  const customer = await stripeRequest<{ id: string }>("POST", "/v1/customers", {
    name: company?.name ?? "Atlas", email: company?.email ?? undefined, metadata: { companyId: auth.companyId }
  });
  await query("INSERT INTO company_subscriptions (company_id, stripe_customer_id) VALUES ($1, $2) ON CONFLICT (company_id) DO NOTHING", [auth.companyId, customer.id]);
  return (await subscriptionRow(auth.companyId))!.stripe_customer_id;
}

billingRouter.post("/checkout", asyncHandler(async (req, res) => {
  const auth = await requireDirector(req);
  if (!billingConfigured()) throw new ApiError(409, "BILLING_NOT_CONFIGURED", "Payments are not configured on this server");
  const input = z.object({ plan: z.enum(["STANDARD", "STANDARD_AI"]), period: z.enum(["MONTH", "YEAR"]) }).strict().parse(req.body);
  const current = await subscriptionOf(auth.companyId);
  if (current && current.status && !["canceled", "incomplete_expired"].includes(current.status)) {
    throw new ApiError(409, "BILLING_ALREADY_SUBSCRIBED", "Change the tariff in the payment settings");
  }
  const customer = await customerOf(auth);
  const base = config.corsOrigins[0] ?? appUrl(req);
  const session = await stripeRequest<{ url: string }>("POST", "/v1/checkout/sessions", {
    mode: "subscription", customer, client_reference_id: auth.companyId,
    line_items: [{ price: priceIds()[`${input.plan}:${input.period}`], quantity: Math.max(1, await activeUserCount(auth.companyId)) }],
    subscription_data: { metadata: { companyId: auth.companyId } },
    success_url: `${base}/settings/billing?checkout=success`, cancel_url: `${base}/settings/billing?checkout=cancel`
  });
  await writeAudit(req, { auth, action: "BILLING_CHECKOUT_STARTED", entityType: "company", entityId: auth.companyId, metadata: { plan: input.plan, period: input.period } });
  res.json({ data: { url: session.url } });
}));

billingRouter.post("/portal", asyncHandler(async (req, res) => {
  const auth = await requireDirector(req);
  if (!billingConfigured()) throw new ApiError(409, "BILLING_NOT_CONFIGURED", "Payments are not configured on this server");
  const row = await subscriptionRow(auth.companyId);
  if (!row) throw new ApiError(409, "BILLING_NO_CUSTOMER", "Choose a tariff first");
  const base = config.corsOrigins[0] ?? appUrl(req);
  const session = await stripeRequest<{ url: string }>("POST", "/v1/billing_portal/sessions", {
    customer: row.stripe_customer_id, return_url: `${base}/settings/billing`, configuration: config.STRIPE_PORTAL_CONFIGURATION
  });
  await writeAudit(req, { auth, action: "BILLING_PORTAL_OPENED", entityType: "company", entityId: auth.companyId });
  res.json({ data: { url: session.url } });
}));

interface StripeInvoice {
  number: string | null; period_start: number; period_end: number; amount_due: number; amount_paid: number; currency: string;
  status: string | null; hosted_invoice_url: string | null; invoice_pdf: string | null;
  lines?: { data: Array<{ period?: { start: number; end: number } }> };
}

billingRouter.get("/invoices", asyncHandler(async (req, res) => {
  const auth = await requireDirector(req);
  const row = await subscriptionRow(auth.companyId);
  if (!billingConfigured() || !row) { res.json({ data: [] }); return; }
  const invoices = await stripeRequest<{ data: StripeInvoice[] }>("GET", "/v1/invoices", { customer: row.stripe_customer_id, limit: 12 });
  const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
  res.json({ data: invoices.data.map((invoice) => {
    const period = invoice.lines?.data[0]?.period;
    return {
      number: invoice.number, periodStart: iso(period?.start ?? invoice.period_start), periodEnd: iso(period?.end ?? invoice.period_end),
      amountDue: invoice.amount_due, amountPaid: invoice.amount_paid, currency: invoice.currency.toUpperCase(), status: invoice.status,
      hostedUrl: invoice.hosted_invoice_url, pdfUrl: invoice.invoice_pdf
    };
  }) });
}));
