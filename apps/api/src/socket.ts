import type { Server as HttpServer } from "node:http";
import { scopeDepartments } from "./scope";
import { Server } from "socket.io";
import { coveredDepartments, SUB_DEPARTMENTS_SQL, verifyAccessToken } from "./auth";
import { config } from "./config";
import { query } from "./db";
import { applyActivity, closeSocket, MONITORING_POLICY_VERSION, presenceFor, touchSocket, type PresenceTransition } from "./presence";
import { userRoom } from "./realtime";
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
      const current = await query<{ id: string; company_id: string; department_id: string | null; username: string; role: Role; must_change_password: boolean; sub_departments: string[] }>(
        `SELECT id, company_id, department_id, username, role, must_change_password, ${SUB_DEPARTMENTS_SQL} AS sub_departments FROM users u WHERE id=$1 AND company_id=$2 AND status='ACTIVE'`,
        [auth.userId, auth.companyId]
      );
      const user = current.rows[0];
      if (!user || user.role === "MANAGER" && !user.department_id) throw new Error("Account unavailable");
      if (user.must_change_password) {
        next(new Error("password_change_required"));
        return;
      }
      socket.data.auth = {
        userId: user.id, companyId: user.company_id, departmentId: user.department_id, departmentIds: coveredDepartments(user),
        username: user.username, role: user.role
      } satisfies AuthContext;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const auth = socket.data.auth as AuthContext;

    // Only real changes of state are broadcast and recorded; extra tabs and heartbeats are silent.
    const publish = async (transition: PresenceTransition, event: "ONLINE" | "OFFLINE") => {
      if (!transition.changed) return;
      if (transition.timedOutAt) await recordPresence(auth, "TIMEOUT", socket.id, transition.timedOutAt);
      await recordPresence(auth, event, socket.id);
      io.to(presenceAudienceRooms(auth)).emit("presence:changed", transition.state);
      // Everyone in the company sees whether a colleague is online; times stay with the scoped event above.
      io.to(companyPresenceRoom(auth.companyId)).emit("presence:online", { userId: auth.userId, online: transition.state.online });
    };

    // The browser measures idleness itself; this tells it how long a pause still counts as online.
    socket.emit("presence:config", { idleMinutes: config.PRESENCE_IDLE_MINUTES });

    // Handlers are attached at once so nothing sent during setup is lost; they wait for setup to finish.
    const ready = (async () => {
      await socket.join([...presenceSubscriptionRooms(auth), companyPresenceRoom(auth.companyId), userRoom(auth.userId)]);
      await touchSocket(auth.userId, socket.id);
      await publish(await applyActivity(auth.userId, true), "ONLINE");
      const userIds = await visibleUserIds(auth);
      const snapshot = await presenceFor(userIds);
      socket.emit("presence:snapshot", userIds.map((id) => snapshot[id] ?? { userId: id, status: "OFFLINE", lastSeenAt: null }));
    })().catch((error) => console.error("Socket setup failed", error));

    socket.on("presence:heartbeat", async (payload: unknown, acknowledge?: (state: unknown) => void) => {
      await ready;
      // Older clients send no flag; they count as active, as before.
      const active = !(payload && typeof payload === "object" && (payload as { active?: unknown }).active === false);
      await touchSocket(auth.userId, socket.id);
      const transition = await applyActivity(auth.userId, active);
      await publish(transition, active ? "ONLINE" : "OFFLINE");
      if (typeof acknowledge === "function") acknowledge(transition.state);
    });

    socket.on("disconnect", async () => {
      await ready;
      await publish(await closeSocket(auth.userId, socket.id), "OFFLINE");
    });
  });

  return io;
}

const companyPresenceRoom = (companyId: string) => `presence:company:${companyId}`;

function presenceSubscriptionRooms(auth: AuthContext): string[] {
  const rooms = [`presence:user:${auth.userId}`];
  if (auth.role === "DIRECTOR") rooms.push(`presence:directors:${auth.companyId}`);
  if (auth.role === "MANAGER") {
    for (const department of scopeDepartments(auth)) rooms.push(`presence:managers:${auth.companyId}:${department}`);
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
  if (auth.role === "MANAGER") { values.push(scopeDepartments(auth)); clauses.push("department_id = ANY($2::uuid[])"); }
  if (auth.role === "EMPLOYEE") { values.push(auth.userId); clauses.push("id=$2"); }
  const users = await query<{ id: string }>(`SELECT id FROM users WHERE ${clauses.join(" AND ")}`, values);
  return users.rows.map((row) => row.id);
}

/** Presence history is kept only for people who accepted the current monitoring policy. */
export async function recordPresence(auth: AuthContext, event: "ONLINE" | "OFFLINE" | "TIMEOUT", sessionId: string, occurredAt?: string): Promise<void> {
  await query(
    `INSERT INTO presence_events (company_id, user_id, event, session_id, occurred_at)
     SELECT $1, $2, $3, $4, COALESCE($5::timestamptz, now())
     WHERE EXISTS (SELECT 1 FROM users WHERE id = $2 AND monitoring_consent_at IS NOT NULL AND monitoring_consent_version = $6)`,
    [auth.companyId, auth.userId, event, sessionId, occurredAt ?? null, MONITORING_POLICY_VERSION]
  ).catch(() => undefined);
}
