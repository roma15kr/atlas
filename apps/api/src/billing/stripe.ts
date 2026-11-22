/**
 * A small Stripe REST client (no SDK): form-encoded requests with the secret key, and the webhook signature check.
 * The transport is replaceable in tests, like the push sender.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config";
import { ApiError } from "../errors";

export type Plan = "STANDARD" | "STANDARD_AI";
export type Period = "MONTH" | "YEAR";
export const PLANS: Plan[] = ["STANDARD", "STANDARD_AI"];
export const PERIODS: Period[] = ["MONTH", "YEAR"];

/** Stripe's price id for each tariff and period, from the environment. */
export function priceIds(): Record<`${Plan}:${Period}`, string | undefined> {
  return {
    "STANDARD:MONTH": config.STRIPE_PRICE_STANDARD_MONTHLY, "STANDARD:YEAR": config.STRIPE_PRICE_STANDARD_YEARLY,
    "STANDARD_AI:MONTH": config.STRIPE_PRICE_AI_MONTHLY, "STANDARD_AI:YEAR": config.STRIPE_PRICE_AI_YEARLY
  };
}

export function billingConfigured(): boolean {
  return Boolean(config.STRIPE_SECRET_KEY && config.STRIPE_WEBHOOK_SECRET) && Object.values(priceIds()).every(Boolean);
}

export function planOfPrice(priceId: string): { plan: Plan; period: Period } | null {
  const entry = Object.entries(priceIds()).find(([, id]) => id === priceId);
  if (!entry) return null;
  const [plan, period] = entry[0].split(":") as [Plan, Period];
  return { plan, period };
}

export type StripeTransport = (method: "GET" | "POST", path: string, body: URLSearchParams | null) => Promise<{ status: number; body: unknown }>;

let transport: StripeTransport = async (method, path, body) => {
  const url = `https://api.stripe.com${path}${method === "GET" && body ? `?${body.toString()}` : ""}`;
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${config.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2024-06-20" },
    body: method === "POST" && body ? body.toString() : undefined,
    signal: AbortSignal.timeout(15_000)
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};
export function setStripeTransport(next: StripeTransport): void { transport = next; }

/** Flattens nested values into Stripe's form keys: `{ a: [{ b: 1 }] }` → `a[0][b]=1`. */
export function stripeForm(values: Record<string, unknown>): URLSearchParams {
  const form = new URLSearchParams();
  const add = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) value.forEach((item, index) => add(`${key}[${index}]`, item));
    else if (typeof value === "object") for (const [name, inner] of Object.entries(value)) add(`${key}[${name}]`, inner);
    else form.append(key, String(value));
  };
  for (const [key, value] of Object.entries(values)) add(key, value);
  return form;
}

/** Calls Stripe; a failure becomes a 502 `BILLING_PROVIDER_ERROR` without Stripe's details reaching the client. */
export async function stripeRequest<T>(method: "GET" | "POST", path: string, values: Record<string, unknown> = {}): Promise<T> {
  if (!config.STRIPE_SECRET_KEY) throw new ApiError(409, "BILLING_NOT_CONFIGURED", "Payments are not configured on this server");
  const form = stripeForm(values);
  const result = await transport(method, path, [...form.keys()].length ? form : null);
  if (result.status < 200 || result.status >= 300) {
    console.error("Stripe request failed", method, path, result.status, (result.body as { error?: { type?: string; code?: string } } | null)?.error?.code);
    throw new ApiError(502, "BILLING_PROVIDER_ERROR", "The payment provider did not respond as expected");
  }
  return result.body as T;
}

/**
 * Checks `Stripe-Signature: t=…,v1=…`: an HMAC-SHA256 of `t.payload` with the endpoint secret, within 5 minutes.
 */
export function verifyStripeSignature(payload: Buffer, header: string | undefined, secret: string, now = new Date()): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").map((part) => part.split("=") as [string, string]);
  const timestamp = Number(parts.find(([key]) => key === "t")?.[1]);
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!Number.isFinite(timestamp) || !signatures.length) return false;
  if (Math.abs(now.getTime() / 1000 - timestamp) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.`).update(payload).digest();
  return signatures.some((signature) => {
    const given = Buffer.from(signature, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
