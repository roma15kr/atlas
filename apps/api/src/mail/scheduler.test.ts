import { beforeEach, describe, expect, it, vi } from "vitest";

const clientQuery = vi.hoisted(() => vi.fn());
const queryMock = vi.hoisted(() => vi.fn());
const syncAccount = vi.hoisted(() => vi.fn());
const recordFailure = vi.hoisted(() => vi.fn());
vi.mock("../db", () => ({ query: queryMock, pool: { connect: async () => ({ query: clientQuery, release: vi.fn() }) } }));
vi.mock("./sync", () => ({ syncAccount, recordFailure }));

import { runDueSyncs, syncWithLock } from "./scheduler";

beforeEach(() => { clientQuery.mockReset(); queryMock.mockReset(); syncAccount.mockReset(); recordFailure.mockReset().mockResolvedValue(undefined); });

describe("mail scheduler", () => {
  it("skips a mailbox another process is syncing", async () => {
    clientQuery.mockResolvedValueOnce({ rows: [{ locked: false }] });
    expect(await syncWithLock("a1", "u1")).toBe(false);
    expect(syncAccount).not.toHaveBeenCalled();
  });

  it("syncs under the lock and always releases it", async () => {
    clientQuery.mockResolvedValue({ rows: [{ locked: true }] });
    syncAccount.mockRejectedValueOnce(Object.assign(new Error("boom"), { recorded: true }));
    expect(await syncWithLock("a1", "u1")).toBe(true);
    expect(clientQuery.mock.calls.at(-1)![0]).toContain("pg_advisory_unlock");
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("records a failure that happened before the sync loaded the mailbox", async () => {
    clientQuery.mockResolvedValue({ rows: [{ locked: true }] });
    syncAccount.mockRejectedValueOnce(new Error("db down"));
    await syncWithLock("a1", "u1");
    expect(recordFailure).toHaveBeenCalledWith({ id: "a1", user_id: "u1" }, expect.any(Error));
  });

  it("picks only due, connected, non-demo mailboxes up to the concurrency cap", async () => {
    queryMock.mockResolvedValue({ rows: [{ id: "a1", user_id: "u1" }, { id: "a2", user_id: "u2" }] });
    clientQuery.mockResolvedValue({ rows: [{ locked: true }] });
    syncAccount.mockResolvedValue({ newMessages: 0, folders: 1 });
    expect(await runDueSyncs(5)).toBe(2);
    const [sql, values] = queryMock.mock.calls[0]!;
    expect(sql).toContain("status = 'CONNECTED' AND next_sync_at <= now() AND NOT (secret ? 'demo')");
    expect(values).toEqual([5]);
    expect(syncAccount).toHaveBeenCalledTimes(2);
  });
});
