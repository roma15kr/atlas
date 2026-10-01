import { afterEach, describe, expect, it } from "vitest";
import {
  applyActivity, closeSocket, memoryPresenceStore, presenceFor, redisPresenceStore, setPresenceStore, touchSocket,
  type PresenceRedis, type PresenceStore
} from "./presence";

/** A tiny in-memory stand-in for the Redis commands the store uses, with a controllable clock. */
function fakeRedis(clock: () => number): PresenceRedis {
  const values = new Map<string, { value: string; expiresAt: number }>();
  const sets = new Map<string, Map<string, number>>();
  const live = (key: string) => { const entry = values.get(key); if (entry && entry.expiresAt > clock()) return entry.value; values.delete(key); return null; };
  return {
    async get(key) { return live(key); },
    async set(key, value, options) { values.set(key, { value, expiresAt: options?.EX ? clock() + options.EX * 1000 : Infinity }); },
    async del(key) { values.delete(key); },
    async zAdd(key, member) { const set = sets.get(key) ?? new Map(); set.set(member.value, member.score); sets.set(key, set); },
    async zRem(key, member) { sets.get(key)?.delete(member); },
    async zRemRangeByScore(key, _min, max) { const set = sets.get(key); if (set) for (const [id, score] of set) if (score <= Number(max)) set.delete(id); },
    async zCard(key) { return sets.get(key)?.size ?? 0; },
    async pExpire() { /* expiry of the whole set is not needed for these tests */ },
    async mGet(keys) { return keys.map(live); }
  };
}

const backends: Array<[string, (clock: () => number) => PresenceStore]> = [
  ["memory", (clock) => memoryPresenceStore(clock)],
  ["redis", (clock) => redisPresenceStore(fakeRedis(clock))]
];

afterEach(() => setPresenceStore(null));

describe.each(backends)("presence on the %s store", (_name, create) => {
  let now = 1_000_000;
  const clock = () => now;
  const setup = () => { now = 1_000_000; setPresenceStore(create(clock)); };

  it("keeps a user online while another tab stays open", async () => {
    setup();
    await touchSocket("u", "tab-1", now);
    expect((await applyActivity("u", true, now)).changed).toBe(true);
    await touchSocket("u", "tab-2", now);
    expect((await applyActivity("u", true, now)).changed).toBe(false);
    expect((await closeSocket("u", "tab-1", now)).changed).toBe(false);
    expect((await presenceFor(["u"])).u?.online).toBe(true);
    const last = await closeSocket("u", "tab-2", now);
    expect(last).toMatchObject({ changed: true, state: { status: "OFFLINE" } });
    expect(await presenceFor(["u"])).toEqual({});
  });

  it("goes offline on an inactive heartbeat and back online on activity", async () => {
    setup();
    await touchSocket("u", "tab", now);
    await applyActivity("u", true, now);
    now += 300_000 - 1;
    const idle = await applyActivity("u", false, now);
    expect(idle).toMatchObject({ changed: true, state: { online: false } });
    expect((await applyActivity("u", false, now)).changed).toBe(false);
    const back = await applyActivity("u", true, now + 1000);
    expect(back.changed).toBe(true);
    expect(back.timedOutAt).toBeUndefined();
  });

  it("reports a timeout once when an online state expired without a disconnect", async () => {
    setup();
    await touchSocket("u", "tab", now);
    await applyActivity("u", true, now);
    const seen = new Date(now).toISOString();
    now += 600_000;
    expect(await presenceFor(["u"])).toEqual({});
    const woke = await applyActivity("u", true, now);
    expect(woke).toMatchObject({ changed: true, timedOutAt: seen });
    expect((await applyActivity("u", true, now)).timedOutAt).toBeUndefined();
  });

  it("forgets a connection that stopped sending heartbeats", async () => {
    setup();
    await touchSocket("u", "sleeping", now);
    await touchSocket("u", "active", now);
    await applyActivity("u", true, now);
    now += 200_000;
    await touchSocket("u", "active", now);
    expect((await closeSocket("u", "active", now)).changed).toBe(true);
  });
});
