import { describe, expect, it } from "vitest";
import { plainPreview } from "./preview";

describe("plainPreview", () => {
  it("drops formatting, keeps link text and marks images", () => {
    expect(plainPreview("КП отправлено, **ждём ответа** — [договор](https://x.test/d) ![](/api/v1/images/1)\n- [ ] позвонить"))
      .toBe("КП отправлено, ждём ответа — договор [изображение] позвонить");
  });

  it("cuts long text to the limit with an ellipsis", () => {
    const preview = plainPreview("а".repeat(200));
    expect(preview).toHaveLength(120);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("returns an empty string for nothing", () => {
    expect(plainPreview(null)).toBe("");
  });
});
