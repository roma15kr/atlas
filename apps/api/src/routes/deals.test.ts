import { describe, expect, it } from "vitest";
import { dealInputSchema } from "./deals";

const validDeal = {
  clientId: "11111111-1111-4111-8111-111111111111",
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
