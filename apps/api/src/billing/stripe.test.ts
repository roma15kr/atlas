import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { config } from "../config";
import { planOfPrice, stripeForm, verifyStripeSignature } from "./stripe";

const sign = (payload: string, secret: string, at: number) => `t=${at},v1=${createHmac("sha256", secret).update(`${at}.${payload}`).digest("hex")}`;

describe("Stripe helpers", () => {
  const now = new Date("2026-11-22T10:00:00Z");
  const at = Math.floor(now.getTime() / 1000);

  it("accepts a valid signature, rejects a changed body, a wrong secret and a timestamp older than 5 minutes", () => {
    const body = '{"id":"evt_1"}';
    expect(verifyStripeSignature(Buffer.from(body), sign(body, "whsec_a", at), "whsec_a", now)).toBe(true);
    expect(verifyStripeSignature(Buffer.from('{"id":"evt_2"}'), sign(body, "whsec_a", at), "whsec_a", now)).toBe(false);
    expect(verifyStripeSignature(Buffer.from(body), sign(body, "whsec_b", at), "whsec_a", now)).toBe(false);
    expect(verifyStripeSignature(Buffer.from(body), sign(body, "whsec_a", at - 301), "whsec_a", now)).toBe(false);
    expect(verifyStripeSignature(Buffer.from(body), undefined, "whsec_a", now)).toBe(false);
  });

  it("maps each configured price id to its tariff and period", () => {
    Object.assign(config, { STRIPE_PRICE_STANDARD_MONTHLY: "p1", STRIPE_PRICE_STANDARD_YEARLY: "p2", STRIPE_PRICE_AI_MONTHLY: "p3", STRIPE_PRICE_AI_YEARLY: "p4" });
    expect(planOfPrice("p2")).toEqual({ plan: "STANDARD", period: "YEAR" });
    expect(planOfPrice("p3")).toEqual({ plan: "STANDARD_AI", period: "MONTH" });
    expect(planOfPrice("unknown")).toBeNull();
  });

  it("flattens nested values into Stripe's form keys", () => {
    expect(stripeForm({ line_items: [{ price: "p1", quantity: 3 }], metadata: { companyId: "c1" }, skip: undefined }).toString())
      .toBe("line_items%5B0%5D%5Bprice%5D=p1&line_items%5B0%5D%5Bquantity%5D=3&metadata%5BcompanyId%5D=c1");
  });
});
