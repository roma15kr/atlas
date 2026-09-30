import { describe, expect, it } from "vitest";
import { dealInputSchema, dealScope } from "./deals";

const validDeal = {
  clientId: "11111111-1111-4111-8111-111111111111",
  funnelId: "55555555-5555-4555-8555-555555555555",
  title: "Annual plan"
};

describe("deal currency", () => {
  it("defaults new deals to Ukrainian hryvnia", () => {
    expect(dealInputSchema.parse(validDeal).currency).toBe("UAH");
  });

  it("normalizes UAH and rejects foreign currencies", () => {
    expect(dealInputSchema.parse({ ...validDeal, currency: "uah" }).currency).toBe("UAH");
    expect(dealInputSchema.safeParse({ ...validDeal, currency: "USD" }).success).toBe(false);
    expect(dealInputSchema.safeParse({ ...validDeal, currency: "RUB" }).success).toBe(false);
  });
});

describe("deal funnel input", () => {
  it("requires a funnel and leaves the stage to the funnel default", () => {
    const { funnelId: _funnelId, ...withoutFunnel } = validDeal;
    expect(dealInputSchema.safeParse(withoutFunnel).success).toBe(false);
    expect(dealInputSchema.parse(validDeal).stageId).toBeUndefined();
  });

  it("no longer accepts legacy stage keys", () => {
    expect(dealInputSchema.parse({ ...validDeal, stage: "PAYMENT" })).not.toHaveProperty("stage");
  });
});

describe("dealScope", () => {
  it("combines record scope with funnel access for employees", () => {
    const scope = dealScope({
      userId: "11111111-1111-4111-8111-111111111111", companyId: "22222222-2222-4222-8222-222222222222",
      departmentId: null, username: "employee", role: "EMPLOYEE"
    }, 2);
    expect(scope.sql).toContain("d.owner_id = $3");
    expect(scope.sql).toContain("d.funnel_id IN (SELECT af.id FROM deal_funnels af WHERE af.company_id = $4");
    expect(scope.values).toHaveLength(5);
  });
});
