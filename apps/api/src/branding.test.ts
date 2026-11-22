import { describe, expect, it } from "vitest";
import { contrastRatio, pngSize } from "./branding";

describe("branding helpers", () => {
  it("measures contrast like WCAG", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#176f68")).toBeCloseTo(5.98, 1);
    expect(contrastRatio("#f5d90a", "#ffffff")).toBeLessThan(2);
  });

  it("reads a PNG's size from IHDR and rejects other bytes", () => {
    const body = Buffer.alloc(32);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(body);
    body.writeUInt32BE(13, 8); body.write("IHDR", 12, "ascii"); body.writeUInt32BE(180, 16); body.writeUInt32BE(180, 20);
    expect(pngSize(body)).toEqual({ width: 180, height: 180 });
    expect(pngSize(Buffer.from("<svg/>"))).toBeNull();
  });
});

describe("contrast shared with the web", () => {
  it("measures the shared fixture like the web does", async () => {
    const { readFile } = await import("node:fs/promises");
    const rows = JSON.parse(await readFile(new URL("../../web/src/lib/brandingContrast.fixture.json", import.meta.url), "utf8")) as Array<{ color: string; onWhite: number }>;
    expect(rows.length).toBe(20);
    for (const row of rows) expect(contrastRatio(row.color, "#ffffff")).toBeCloseTo(row.onWhite, 3);
  });
});
