import type { Server } from "socket.io";

let io: Server | null = null;

/** Set once at startup; routes emit through this so tests and scripts run without a socket server. */
export function setRealtimeServer(server: Server | null): void {
  io = server;
}

export const userRoom = (userId: string): string => `user:${userId}`;

/** Sends an event to every open session of the given users, and nobody else. */
export function emitToUsers(userIds: Iterable<string>, event: string, payload: unknown): void {
  const rooms = [...new Set(userIds)].map(userRoom);
  if (!io || !rooms.length) return;
  io.to(rooms).emit(event, payload);
}

/** Closes every open socket of a user, for example when their account is disabled. */
export function disconnectUser(userId: string): void {
  io?.in(userRoom(userId)).disconnectSockets(true);
}
