/** Tariffs through Stripe: director-only screens, the signed webhook, seats following the team, AI by tariff, reminders. */
import { startDbHarness, type TestUser } from "../test/dbHarness";
import { createHmac } from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let boss: TestUser, head: TestUser, seller: TestUser;
let company: string;
const WEBHOOK_SECRET = "whsec_test_secret";
const calls: Array<{ method: string; path: string; body: Record<string, string> }> = [];
let quantity = 0;

const auth = (who: TestUser) => ({ Authorization: `Bearer ${who.token}` });
const PRICES: Record<string, number> = { price_std_m: 700, price_std_y: 6000, price_ai_m: 1000, price_ai_y: 9600 };
const signed = (event: object, secret = WEBHOOK_SECRET, at = Math.floor(Date.now() / 1000)) => {
  const body = JSON.stringify(event);
  const signature = createHmac("sha256", secret).update(`${at}.${body}`).digest("hex");
  return request(app).post("/api/stripe/webhook").set("Content-Type", "application/json").set("Stripe-Signature", `t=${at},v1=${signature}`).send(body);
};
let eventNumber = 0;
const subscriptionEvent = (type: string, overrides: Record<string, unknown> = {}) => ({
  id: `evt_${++eventNumber}`, type,
  data: { object: { id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: false, current_period_end: 1_800_000_000,
    items: { data: [{ id: "si_1", quantity: 3, price: { id: "price_ai_y" } }] }, metadata: { companyId: company }, ...overrides } }
});
const subscriptionRow = async () => (await harness.query<Record<string, unknown>>("SELECT * FROM company_subscriptions WHERE company_id = $1", [company])).rows[0];
const audits = async (action: string) => (await harness.query<{ metadata: Record<string, unknown> }>("SELECT metadata FROM audit_logs WHERE action = $1 ORDER BY created_at", [action])).rows;
const inbox = async (who: TestUser) => (await request(app).get("/api/v1/notifications").set(auth(who))).body.data as Array<{ kind: string; title: string; link: string }>;

beforeAll(async () => {
  harness = await startDbHarness();
  const { memoryPresenceStore, setPresenceStore } = await import("../presence");
  setPresenceStore(memoryPresenceStore());
  const { config } = await import("../config");
  Object.assign(config, {
    STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_PRICE_STANDARD_MONTHLY: "price_std_m", STRIPE_PRICE_STANDARD_YEARLY: "price_std_y", STRIPE_PRICE_AI_MONTHLY: "price_ai_m", STRIPE_PRICE_AI_YEARLY: "price_ai_y"
  });
  (await import("../billing/stripe")).setStripeTransport(async (method, path, body) => {
    calls.push({ method, path, body: Object.fromEntries(body ?? []) });
    if (method === "GET" && path.startsWith("/v1/prices/")) return { status: 200, body: { unit_amount: PRICES[path.split("/").at(-1)!], currency: "usd" } };
    if (path === "/v1/customers") return { status: 200, body: { id: "cus_1" } };
    if (path === "/v1/checkout/sessions") return { status: 200, body: { url: "https://checkout.stripe.test/s_1" } };
    if (path === "/v1/billing_portal/sessions") return { status: 200, body: { url: "https://billing.stripe.test/p_1" } };
    if (method === "GET" && path === "/v1/subscriptions/sub_1") return { status: 200, body: { id: "sub_1", items: { data: [{ id: "si_1", quantity, price: { id: "price_ai_y" } }] } } };
    if (method === "POST" && path === "/v1/subscriptions/sub_1") { quantity = Number(body?.get("items[0][quantity]")); return { status: 200, body: {} }; }
    if (path === "/v1/invoices") return { status: 200, body: { data: [{ number: "A-1", period_start: 1_700_000_000, period_end: 1_731_536_000, amount_due: 28800, amount_paid: 28800, currency: "usd", status: "paid", hosted_invoice_url: "https://invoice.stripe.test/1", invoice_pdf: "https://invoice.stripe.test/1.pdf" }] } };
    return { status: 404, body: { error: { code: "resource_missing" } } };
  });
  app = (await import("../app")).app;
  boss = await harness.user("nikonov", "DIRECTOR", "Руководство", { consent: true });
  head = await harness.user("denysiuk", "MANAGER", "Отдел продаж", { consent: true });
  seller = await harness.user("babenko", "EMPLOYEE", "Отдел продаж", { consent: true });
  company = (await harness.query<{ company_id: string }>("SELECT company_id FROM users WHERE id = $1", [boss.id])).rows[0]!.company_id;
}, 60_000);

afterAll(async () => { await harness?.stop(); });

describe("tariffs and payments", () => {
  it("reports billing as not configured without keys, and AI stays available", async () => {
    const { config } = await import("../config");
    const key = config.STRIPE_SECRET_KEY;
    config.STRIPE_SECRET_KEY = undefined;
    try {
      const response = await request(app).get("/api/v1/billing").set(auth(boss));
      expect(response.body.data).toMatchObject({ configured: false, plans: [], subscription: null });
      expect((await request(app).post("/api/v1/billing/checkout").set(auth(boss)).send({ plan: "STANDARD", period: "MONTH" })).body.error.code).toBe("BILLING_NOT_CONFIGURED");
      expect((await request(app).get("/api/v1/billing/features").set(auth(seller))).body.data).toEqual({ ai: true });
    } finally { config.STRIPE_SECRET_KEY = key; }
  });

  it("gives a director the plans from Stripe and a checkout with the active-user quantity, and opens Atlas's own portal when configured", async () => {
    const { config } = await import("../config");
    const overview = (await request(app).get("/api/v1/billing").set(auth(boss))).body.data;
    expect(overview).toMatchObject({ configured: true, activeUsers: 3, subscription: null });
    expect(overview.plans).toEqual(expect.arrayContaining([{ plan: "STANDARD", period: "YEAR", unitAmount: 6000, currency: "USD" }, { plan: "STANDARD_AI", period: "MONTH", unitAmount: 1000, currency: "USD" }]));
    const checkout = await request(app).post("/api/v1/billing/checkout").set(auth(boss)).send({ plan: "STANDARD_AI", period: "YEAR" });
    expect(checkout.body.data).toEqual({ url: "https://checkout.stripe.test/s_1" });
    const session = calls.find((call) => call.path === "/v1/checkout/sessions")!.body;
    expect(session).toMatchObject({ mode: "subscription", customer: "cus_1", client_reference_id: company, "line_items[0][price]": "price_ai_y", "line_items[0][quantity]": "3" });
    expect((await audits("BILLING_CHECKOUT_STARTED")).at(-1)!.metadata).toEqual({ plan: "STANDARD_AI", period: "YEAR" });
    expect((await request(app).post("/api/v1/billing/portal").set(auth(boss))).body.data.url).toBe("https://billing.stripe.test/p_1");
    expect(calls.filter((call) => call.path === "/v1/billing_portal/sessions").at(-1)!.body.configuration).toBeUndefined();
    config.STRIPE_PORTAL_CONFIGURATION = "bpc_atlas";
    await request(app).post("/api/v1/billing/portal").set(auth(boss));
    expect(calls.filter((call) => call.path === "/v1/billing_portal/sessions").at(-1)!.body).toMatchObject({ customer: "cus_1", configuration: "bpc_atlas" });
    config.STRIPE_PORTAL_CONFIGURATION = undefined;
  });

  it("refuses a manager and an employee with 403 and audits it", async () => {
    for (const who of [head, seller]) {
      for (const call of [request(app).get("/api/v1/billing"), request(app).post("/api/v1/billing/checkout").send({ plan: "STANDARD", period: "MONTH" }), request(app).post("/api/v1/billing/portal"), request(app).get("/api/v1/billing/invoices")]) {
        const response = await call.set(auth(who));
        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe("DIRECTOR_ONLY");
      }
    }
    expect((await audits("BILLING_ACCESS_DENIED")).length).toBe(8);
  });

  it("rejects a webhook with a bad signature, a changed body or an old timestamp without changing anything", async () => {
    const event = subscriptionEvent("customer.subscription.created");
    expect((await signed(event, "whsec_wrong")).status).toBe(400);
    expect((await signed(event, WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 600)).status).toBe(400);
    const body = JSON.stringify(event);
    const at = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(`${at}.${body}`).digest("hex");
    const tampered = await request(app).post("/api/stripe/webhook").set("Content-Type", "application/json").set("Stripe-Signature", `t=${at},v1=${signature}`).send(body.replace("active", "canceled"));
    expect(tampered.status).toBe(400);
    expect((await subscriptionRow())?.stripe_subscription_id).toBeNull();
  });

  it("stores the subscription from webhook events once, even when an event is delivered twice", async () => {
    await signed({ id: "evt_checkout", type: "checkout.session.completed", data: { object: { client_reference_id: company, subscription: "sub_1", customer: "cus_1" } } });
    const created = subscriptionEvent("customer.subscription.created");
    expect((await signed(created)).body).toEqual({ received: true });
    expect((await signed(created)).body).toEqual({ received: true, duplicate: true });
    expect(await subscriptionRow()).toMatchObject({ stripe_subscription_id: "sub_1", plan: "STANDARD_AI", period: "YEAR", status: "active", quantity: 3, cancel_at_period_end: false });
    expect((await audits("BILLING_SUBSCRIPTION_CHANGED")).length).toBe(1);
    const overview = (await request(app).get("/api/v1/billing").set(auth(boss))).body.data;
    expect(overview.subscription).toMatchObject({ plan: "STANDARD_AI", period: "YEAR", status: "active", quantity: 3 });
    expect((await request(app).post("/api/v1/billing/checkout").set(auth(boss)).send({ plan: "STANDARD", period: "MONTH" })).body.error.code).toBe("BILLING_ALREADY_SUBSCRIBED");
  });

  it("lists invoices from Stripe without storing them", async () => {
    const invoices = (await request(app).get("/api/v1/billing/invoices").set(auth(boss))).body.data;
    expect(invoices).toEqual([expect.objectContaining({ number: "A-1", amountPaid: 28800, currency: "USD", status: "paid", pdfUrl: "https://invoice.stripe.test/1.pdf" })]);
  });

  it("updates the seat count when a user is added, disabled and re-enabled", async () => {
    quantity = 3;
    const created = await request(app).post("/api/v1/team").set(auth(boss)).send({ fullName: "Нова Людина", username: "nova.people", role: "EMPLOYEE", departmentName: "Отдел продаж", password: "Temporary-Pass-2026!" });
    expect(created.status).toBe(201);
    await vi.waitFor(() => expect(quantity).toBe(4));
    expect(calls.filter((call) => call.path === "/v1/subscriptions/sub_1" && call.method === "POST").at(-1)!.body).toMatchObject({ "items[0][quantity]": "4", proration_behavior: "create_prorations" });
    await request(app).post(`/api/v1/team/${created.body.data.id}/disable`).set(auth(boss));
    await vi.waitFor(() => expect(quantity).toBe(3));
    await request(app).post(`/api/v1/team/${created.body.data.id}/enable`).set(auth(boss));
    await vi.waitFor(() => expect(quantity).toBe(4));
    expect((await audits("BILLING_SEATS_UPDATED")).at(-1)!.metadata).toEqual({ from: 3, to: 4 });
  });

  it("fixes a drifted quantity in the scheduler step", async () => {
    await harness.query("UPDATE company_subscriptions SET quantity = 9 WHERE company_id = $1", [company]);
    const { runBilling } = await import("../billing/subscription");
    expect((await runBilling()).seats).toBe(1);
    expect(quantity).toBe(4);
  });

  it("keeps AI on while a «Стандарт + AI» payment is overdue, and notifies directors at once and again after 3 days", async () => {
    await signed({ id: "evt_failed", type: "invoice.payment_failed", data: { object: { customer: "cus_1" } } });
    expect((await request(app).get("/api/v1/billing/features").set(auth(seller))).body.data).toEqual({ ai: true });
    expect((await inbox(boss))[0]).toMatchObject({ kind: "BILLING_PAYMENT_FAILED", title: "Оплата не пройшла", link: "/settings/billing" });
    expect((await inbox(head)).some((item) => item.kind === "BILLING_PAYMENT_FAILED")).toBe(false);
    const { remindOverduePayments } = await import("../billing/subscription");
    expect(await remindOverduePayments(new Date(Date.now() + 86_400_000))).toBe(0);
    expect(await remindOverduePayments(new Date(Date.now() + 3 * 86_400_000 + 60_000))).toBe(1);
    await signed({ id: "evt_paid", type: "invoice.paid", data: { object: { customer: "cus_1" } } });
    expect(await subscriptionRow()).toMatchObject({ payment_failed_at: null });
    expect(await remindOverduePayments(new Date(Date.now() + 10 * 86_400_000))).toBe(0);
  });

  it("refuses a new AI analysis on «Стандарт» without calling the model, and leaves problem reports untriaged", async () => {
    await signed(subscriptionEvent("customer.subscription.updated", { items: { data: [{ id: "si_1", quantity: 4, price: { id: "price_std_m" } }] } }));
    expect((await request(app).get("/api/v1/billing/features").set(auth(seller))).body.data).toEqual({ ai: false });
    const llm = await import("../llm/openai");
    const call = vi.spyOn(llm, "structuredResponse");
    const refused = await request(app).post("/api/v1/ai/analyze").set(auth(head)).send({ mode: "ADVICE", targetUserId: seller.id });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("PLAN_AI_REQUIRED");
    expect(call).not.toHaveBeenCalled();
    expect((await request(app).get("/api/v1/ai/analyses").set(auth(head))).status).toBe(200);
    await harness.query("INSERT INTO feedback_reports (company_id, user_id, kind, message, page) VALUES ($1, $2, 'PROBLEM', 'Не працює збереження задачі', '/tasks')", [company, seller.id]);
    const { processFeedback } = await import("../automation/feedback");
    const triage = vi.fn();
    await processFeedback(new Date(), { canTriage: () => true, canFile: () => false, triage });
    expect(triage).not.toHaveBeenCalled();
  });

  it("turns AI off once a subscription ends", async () => {
    await signed(subscriptionEvent("customer.subscription.deleted", { status: "canceled" }));
    expect((await request(app).get("/api/v1/billing/features").set(auth(seller))).body.data).toEqual({ ai: false });
  });
});
