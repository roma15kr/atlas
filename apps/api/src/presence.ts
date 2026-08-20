import { connectRedis } from "./redis";

export interface PresenceState {
  userId: string;
  status: "ONLINE" | "OFFLINE";
  online: boolean;
  lastSeenAt: string;
  lastSeen: string;
}

const localPresence = new Map<string, { state: PresenceState; expiresAt: number }>();
const TTL_SECONDS = 300;

export async function markOnline(userId: string): Promise<PresenceState> {
  const now = new Date().toISOString();
  const state: PresenceState = { userId, status: "ONLINE", online: true, lastSeenAt: now, lastSeen: now };
  localPresence.set(userId, { state, expiresAt: Date.now() + TTL_SECONDS * 1000 });
  const client = await connectRedis();
  if (client) await client.set(`presence:${userId}`, JSON.stringify(state), { EX: TTL_SECONDS });
  return state;
}

export async function markOffline(userId: string): Promise<PresenceState> {
  const now = new Date().toISOString();
  const state: PresenceState = { userId, status: "OFFLINE", online: false, lastSeenAt: now, lastSeen: now };
  localPresence.delete(userId);
  const client = await connectRedis();
  if (client) await client.del(`presence:${userId}`);
  return state;
}

export async function presenceFor(userIds: string[]): Promise<Record<string, PresenceState>> {
  if (!userIds.length) return {};
  const output: Record<string, PresenceState> = {};
  const client = await connectRedis();
  if (client) {
    const values = await client.mGet(userIds.map((id) => `presence:${id}`));
    values.forEach((value, index) => {
      if (value) output[userIds[index]!] = JSON.parse(value) as PresenceState;
    });
    return output;
  }

  for (const id of userIds) {
    const entry = localPresence.get(id);
    if (entry && entry.expiresAt > Date.now()) output[id] = entry.state;
    else if (entry) localPresence.delete(id);
  }
  return output;
}
