import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("./db", () => ({
  query: vi.fn(),
  transaction: mocks.transaction
}));

import { ensureDefaultCatalogs } from "./bootstrap";

describe("production default catalogs", () => {
  beforeEach(() => {
    mocks.clientQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.transaction.mockReset().mockImplementation(async (work) => work({ query: mocks.clientQuery }));
  });

  it("idempotently initializes deal stages and achievement definitions", async () => {
    await ensureDefaultCatalogs();
    expect(mocks.clientQuery).toHaveBeenCalledTimes(2);
    const statements = mocks.clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(statements[0]).toContain("INSERT INTO deal_stages");
    expect(statements[0]).toContain("ON CONFLICT (company_id, key) DO NOTHING");
    expect(statements[1]).toContain("INSERT INTO achievement_definitions");
    expect(statements[1]).toContain("ON CONFLICT (company_id, code) DO NOTHING");
  });
});
