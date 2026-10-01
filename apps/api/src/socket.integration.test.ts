/** Presence over real Socket.IO connections and Postgres: tabs, idleness, consent-gated history. */
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDbHarness, type TestUser } from "./test/dbHarness";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let http: HttpServer;
let url: string;
let boss: TestUser, anna: TestUser, ivan: TestUser;
const sockets: Socket[] = [];

const open = (user: TestUser) => new Promise<Socket>((resolve, reject) => {
  const socket = connect(url, { auth: { token: user.token }, transports: ["websocket"], forceNew: true });
  sockets.push(socket);
  socket.on("connect", () => resolve(socket));
  socket.on("connect_error", reject);
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
const events = async (userId: string) => (await harness.query<{ event: string }>(
  "SELECT event FROM presence_events WHERE user_id = $1 ORDER BY id", [userId])).rows.map((row) => row.event);
const heartbeat = (socket: Socket, active: boolean) => new Promise((resolve) => socket.emit("presence:heartbeat", { active }, resolve));

beforeAll(async () => {
  harness = await startDbHarness();
  const { createSocketServer } = await import("./socket");
  // No Redis in tests: use the in-memory store directly instead of retrying a connection per call.
  const { memoryPresenceStore, setPresenceStore } = await import("./presence");
  setPresenceStore(memoryPresenceStore());
  boss = await harness.user("boss", "DIRECTOR", null, { consent: true });
  anna = await harness.user("anna", "EMPLOYEE", "Sales", { consent: true });
  ivan = await harness.user("ivan", "EMPLOYEE", "Sales", { consent: false });
  http = createServer();
  createSocketServer(http);
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
}, 60_000);

afterAll(async () => {
  sockets.forEach((socket) => socket.disconnect());
  await new Promise((resolve) => http?.close(resolve));
  await harness?.stop();
});

describe("presence over sockets", () => {
  it("broadcasts and records only real changes across two tabs", async () => {
    const watcher = await open(boss);
    const changes: Array<{ userId: string; status: string }> = [];
    watcher.on("presence:changed", (state) => { if (state.userId === anna.id) changes.push(state); });

    const first = await open(anna);
    await settle();
    const second = await open(anna);
    await heartbeat(second, true);
    await heartbeat(first, true);
    await settle();
    expect(changes.map((change) => change.status)).toEqual(["ONLINE"]);

    second.disconnect();
    await settle();
    expect(changes.map((change) => change.status)).toEqual(["ONLINE"]);

    await heartbeat(first, false);
    await settle();
    expect(changes.map((change) => change.status)).toEqual(["ONLINE", "OFFLINE"]);
    await heartbeat(first, true);
    first.disconnect();
    await settle();
    expect(changes.map((change) => change.status)).toEqual(["ONLINE", "OFFLINE", "ONLINE", "OFFLINE"]);
    expect(await events(anna.id)).toEqual(["ONLINE", "OFFLINE", "ONLINE", "OFFLINE"]);
  });

  it("broadcasts live status but keeps no history without monitoring consent", async () => {
    const watcher = await open(boss);
    const seen: string[] = [];
    watcher.on("presence:changed", (state) => { if (state.userId === ivan.id) seen.push(state.status); });
    const socket = await open(ivan);
    await settle();
    socket.disconnect();
    await settle();
    expect(seen).toEqual(["ONLINE", "OFFLINE"]);
    expect(await events(ivan.id)).toEqual([]);
  });

  it("counts older clients without the active flag as active", async () => {
    const socket = await open(anna);
    const state = await new Promise<{ online: boolean }>((resolve) => socket.emit("presence:heartbeat", { at: Date.now() }, resolve));
    expect(state.online).toBe(true);
    socket.disconnect();
    await settle();
  });
});
