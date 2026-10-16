import { describe, expect, it } from "vitest";
import { pushOptions } from "./push";

describe("push options", () => {
  it("sends with high urgency and a day to deliver, so a locked phone shows it at once", () => {
    expect(pushOptions()).toMatchObject({ urgency: "high", TTL: 86_400 });
  });
});
