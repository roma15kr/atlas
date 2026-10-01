import { connectRedis } from "./redis";

export interface PresenceState {
  userId: string;
  status: "ONLINE" | "OFFLINE";
  online: boolean;
  lastSeenAt: string;
  lastSeen: string;
}

/** The monitoring policy version whose acceptance allows presence history and activity metrics. */
export const MONITORING_POLICY_VERSION = "2026-01";

/** An active user stays ONLINE this long without an active heartbeat. */
export const ACTIVE_TTL_SECONDS = 300;
/** A connection that stops sending heartbeats (sleep, frozen tab) is forgotten after this long. */
export const SOCKET_TTL_MS = 150_000;

/** A change of a user's state; `timedOutAt` is set when an expired ONLINE state was noticed. */
export interface PresenceTransition {
  state: PresenceState;
  changed: boolean;
  timedOutAt?: string;
}

/** Storage for connection sets and activity state: Redis in production, process memory without it. */
export interface PresenceStore {
  addSocket(userId: string, socketId: string, expiresAt: number): Promise<void>;
  removeSocket(userId: string, socketId: string): Promise<void>;
  liveSockets(userId: string, now: number): Promise<number>;
  getState(userId: string): Promise<PresenceState | null>;
  setState(userId: string, state: PresenceState): Promise<void>;
  deleteState(userId: string): Promise<void>;
  /** The last time the user was seen, and whether they were ONLINE then. Survives the state's expiry. */
  getLast(userId: string): Promise<{ at: string; online: boolean } | null>;
  setLast(userId: string, last: { at: string; online: boolean }): Promise<void>;
  many(userIds: string[]): Promise<Array<PresenceState | null>>;
}

export function memoryPresenceStore(clock: () => number = Date.now): PresenceStore {
  const sockets = new Map<string, Map<string, number>>();
  const states = new Map<string, { state: PresenceState; expiresAt: number }>();
  const last = new Map<string, { at: string; online: boolean }>();
  const liveState = (userId: string) => {
    const entry = states.get(userId);
    if (entry && entry.expiresAt > clock()) return entry.state;
    states.delete(userId);
    return null;
  };
  return {
    async addSocket(userId, socketId, expiresAt) {
      const set = sockets.get(userId) ?? new Map<string, number>();
      set.set(socketId, expiresAt);
      sockets.set(userId, set);
    },
    async removeSocket(userId, socketId) { sockets.get(userId)?.delete(socketId); },
    async liveSockets(userId, now) {
      const set = sockets.get(userId);
      if (!set) return 0;
      for (const [id, expiresAt] of set) if (expiresAt <= now) set.delete(id);
      return set.size;
    },
    async getState(userId) { return liveState(userId); },
    async setState(userId, state) { states.set(userId, { state, expiresAt: clock() + ACTIVE_TTL_SECONDS * 1000 }); },
    async deleteState(userId) { states.delete(userId); },
    async getLast(userId) { return last.get(userId) ?? null; },
    async setLast(userId, value) { last.set(userId, value); },
    async many(userIds) { return userIds.map(liveState); }
  };
}

/** The subset of the node-redis client the presence store uses. */
export interface PresenceRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
  zAdd(key: string, member: { score: number; value: string }): Promise<unknown>;
  zRem(key: string, member: string): Promise<unknown>;
  zRemRangeByScore(key: string, min: number | string, max: number | string): Promise<unknown>;
  zCard(key: string): Promise<number>;
  pExpire(key: string, ms: number): Promise<unknown>;
  mGet(keys: string[]): Promise<Array<string | null>>;
}

export function redisPresenceStore(client: PresenceRedis): PresenceStore {
  const parse = <T>(value: string | null): T | null => value ? JSON.parse(value) as T : null;
  return {
    async addSocket(userId, socketId, expiresAt) {
      await client.zAdd(`presence:sockets:${userId}`, { score: expiresAt, value: socketId });
      await client.pExpire(`presence:sockets:${userId}`, ACTIVE_TTL_SECONDS * 1000);
    },
    async removeSocket(userId, socketId) { await client.zRem(`presence:sockets:${userId}`, socketId); },
    async liveSockets(userId, now) {
      await client.zRemRangeByScore(`presence:sockets:${userId}`, "-inf", now);
      return client.zCard(`presence:sockets:${userId}`);
    },
    async getState(userId) { return parse<PresenceState>(await client.get(`presence:${userId}`)); },
    async setState(userId, state) { await client.set(`presence:${userId}`, JSON.stringify(state), { EX: ACTIVE_TTL_SECONDS }); },
    async deleteState(userId) { await client.del(`presence:${userId}`); },
    async getLast(userId) { return parse(await client.get(`presence:last:${userId}`)); },
    async setLast(userId, value) { await client.set(`presence:last:${userId}`, JSON.stringify(value), { EX: 30 * 86_400 }); },
    async many(userIds) { return (await client.mGet(userIds.map((id) => `presence:${id}`))).map((value) => parse<PresenceState>(value)); }
  };
}

const fallbackStore = memoryPresenceStore();
let storeOverride: PresenceStore | null = null;

/** Tests swap the store; production uses Redis when it is reachable. */
export function setPresenceStore(store: PresenceStore | null): void {
  storeOverride = store;
}

async function store(): Promise<PresenceStore> {
  if (storeOverride) return storeOverride;
  const client = await connectRedis();
  return client ? redisPresenceStore(client as unknown as PresenceRedis) : fallbackStore;
}

const stateOf = (userId: string, online: boolean, at: string): PresenceState =>
  ({ userId, status: online ? "ONLINE" : "OFFLINE", online, lastSeenAt: at, lastSeen: at });

/** Registers or refreshes a connection. */
export async function touchSocket(userId: string, socketId: string, now = Date.now()): Promise<void> {
  await (await store()).addSocket(userId, socketId, now + SOCKET_TTL_MS);
}

/**
 * Applies a heartbeat: active keeps or makes the user ONLINE, inactive makes them OFFLINE.
 * `changed` is true only when the state actually flips.
 */
export async function applyActivity(userId: string, active: boolean, now = Date.now()): Promise<PresenceTransition> {
  const presence = await store();
  const at = new Date(now).toISOString();
  const previous = await presence.getState(userId);
  if (active) {
    // Read before overwriting: an ONLINE "last seen" without a live state means it expired unnoticed.
    const last = previous ? null : await presence.getLast(userId);
    const state = stateOf(userId, true, at);
    await presence.setState(userId, state);
    await presence.setLast(userId, { at, online: true });
    if (previous) return { state, changed: false };
    return { state, changed: true, ...(last?.online ? { timedOutAt: last.at } : {}) };
  }
  if (!previous) return { state: stateOf(userId, false, at), changed: false };
  await presence.deleteState(userId);
  await presence.setLast(userId, { at, online: false });
  return { state: stateOf(userId, false, at), changed: true };
}

/** Forgets a closed connection; the user goes OFFLINE only when it was their last one. */
export async function closeSocket(userId: string, socketId: string, now = Date.now()): Promise<PresenceTransition> {
  const presence = await store();
  await presence.removeSocket(userId, socketId);
  const at = new Date(now).toISOString();
  if (await presence.liveSockets(userId, now) > 0) return { state: stateOf(userId, Boolean(await presence.getState(userId)), at), changed: false };
  return applyActivity(userId, false, now);
}

export async function presenceFor(userIds: string[]): Promise<Record<string, PresenceState>> {
  if (!userIds.length) return {};
  const states = await (await store()).many(userIds);
  const output: Record<string, PresenceState> = {};
  states.forEach((state, index) => { if (state) output[userIds[index]!] = state; });
  return output;
}
