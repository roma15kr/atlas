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

  it("seeds a default funnel only for companies without one, then achievement definitions", async () => {
    await ensureDefaultCatalogs();
    expect(mocks.clientQuery).toHaveBeenCalledTimes(3);
    const statements = mocks.clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(statements[0]).toContain("pg_advisory_xact_lock");
    expect(mocks.clientQuery.mock.calls[0]![1]).toEqual(["atlas-default-funnels"]);
    expect(statements[1]).toContain("INSERT INTO deal_funnels");
    expect(statements[1]).toContain("WHERE NOT EXISTS (SELECT 1 FROM deal_funnels f WHERE f.company_id = c.id)");
    expect(statements[1]).toContain("INSERT INTO deal_stages");
    expect(statements[1]).not.toContain("ON CONFLICT");
    expect(statements[2]).toContain("INSERT INTO achievement_definitions");
    expect(statements[2]).toContain("ON CONFLICT (company_id, code) DO NOTHING");
  });
});
