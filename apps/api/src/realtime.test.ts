import { afterEach, describe, expect, it, vi } from "vitest";
import type { Server } from "socket.io";
import { emitToUsers, setRealtimeServer } from "./realtime";

afterEach(() => setRealtimeServer(null));

describe("emitToUsers", () => {
  it("targets only the named users' rooms, once each", () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    setRealtimeServer({ to } as unknown as Server);
    emitToUsers(["a", "b", "a"], "chat:message", { id: 1 });
    expect(to).toHaveBeenCalledWith(["user:a", "user:b"]);
    expect(emit).toHaveBeenCalledWith("chat:message", { id: 1 });
  });

  it("does nothing without a server or recipients", () => {
    expect(() => emitToUsers(["a"], "x", {})).not.toThrow();
    const to = vi.fn();
    setRealtimeServer({ to } as unknown as Server);
    emitToUsers([], "x", {});
    expect(to).not.toHaveBeenCalled();
  });
});
