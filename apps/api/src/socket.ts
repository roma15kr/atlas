import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { verifyAccessToken } from "./auth";
import { config } from "./config";
import { query } from "./db";
import { markOffline, markOnline, presenceFor } from "./presence";
import type { AuthContext, Role } from "./types";

export function createSocketServer(server: HttpServer): Server {
  const io = new Server(server, {
    cors: { origin: config.corsOrigins, credentials: true },
    transports: ["websocket", "polling"]
  });

  io.use(async (socket, next) => {
    try {
      const header = socket.handshake.headers.authorization;
      const token = typeof socket.handshake.auth?.token === "string"
        ? socket.handshake.auth.token
        : header?.startsWith("Bearer ") ? header.slice(7) : "";
      const auth = verifyAccessToken(token);
      const current = await query<{ id: string; company_id: string; department_id: string | null; username: string; role: Role }>(
        "SELECT id, company_id, department_id, username, role FROM users WHERE id=$1 AND company_id=$2 AND status='ACTIVE'",
        [auth.userId, auth.companyId]
      );
      const user = current.rows[0];
      if (!user || user.role === "MANAGER" && !user.department_id) throw new Error("Account unavailable");
      socket.data.auth = {
        userId: user.id, companyId: user.company_id, departmentId: user.department_id,
        username: user.username, role: user.role
      } satisfies AuthContext;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", async (socket) => {
    const auth = socket.data.auth as AuthContext;
    await socket.join(presenceSubscriptionRooms(auth));
    const online = await markOnline(auth.userId);
    await query(
      "INSERT INTO presence_events (company_id, user_id, event, session_id) VALUES ($1,$2,'ONLINE',$3)",
      [auth.companyId, auth.userId, socket.id]
    ).catch(() => undefined);
    io.to(presenceAudienceRooms(auth)).emit("presence:changed", online);

    const userIds = await visibleUserIds(auth);
    const snapshot = await presenceFor(userIds);
    socket.emit("presence:snapshot", userIds.map((id) => snapshot[id] ?? { userId: id, status: "OFFLINE", lastSeenAt: null }));

    socket.on("presence:heartbeat", async (_payload, acknowledge?: (state: unknown) => void) => {
      const state = await markOnline(auth.userId);
      io.to(presenceAudienceRooms(auth)).emit("presence:changed", state);
      acknowledge?.(state);
    });

    socket.on("disconnect", async () => {
      const offline = await markOffline(auth.userId);
      await query(
        "INSERT INTO presence_events (company_id, user_id, event, session_id) VALUES ($1,$2,'OFFLINE',$3)",
        [auth.companyId, auth.userId, socket.id]
      ).catch(() => undefined);
      io.to(presenceAudienceRooms(auth)).emit("presence:changed", offline);
    });
  });

  return io;
}

function presenceSubscriptionRooms(auth: AuthContext): string[] {
  const rooms = [`presence:user:${auth.userId}`];
  if (auth.role === "DIRECTOR") rooms.push(`presence:directors:${auth.companyId}`);
  if (auth.role === "MANAGER" && auth.departmentId) {
    rooms.push(`presence:managers:${auth.companyId}:${auth.departmentId}`);
  }
  return rooms;
}

function presenceAudienceRooms(auth: AuthContext): string[] {
  const rooms = [`presence:user:${auth.userId}`, `presence:directors:${auth.companyId}`];
  if (auth.departmentId) rooms.push(`presence:managers:${auth.companyId}:${auth.departmentId}`);
  return rooms;
}

async function visibleUserIds(auth: AuthContext): Promise<string[]> {
  const values: unknown[] = [auth.companyId];
  const clauses = ["company_id=$1", "status='ACTIVE'"];
  if (auth.role === "MANAGER") { values.push(auth.departmentId); clauses.push("department_id IS NOT DISTINCT FROM $2"); }
  if (auth.role === "EMPLOYEE") { values.push(auth.userId); clauses.push("id=$2"); }
  const users = await query<{ id: string }>(`SELECT id FROM users WHERE ${clauses.join(" AND ")}`, values);
  return users.rows.map((row) => row.id);
}
