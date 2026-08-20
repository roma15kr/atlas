import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => {
  const client = {
    isReady: false,
    connect: vi.fn(),
    on: vi.fn()
  };
  return { client, createClient: vi.fn(() => client) };
});

vi.mock("redis", () => ({ createClient: mock.createClient }));

import { connectRedis, redis } from "./redis";

describe("connectRedis", () => {
  beforeEach(() => {
    mock.client.isReady = false;
    mock.client.connect.mockReset().mockImplementation(async () => {
      mock.client.isReady = true;
      return mock.client;
    });
  });

  it("starts a new connection after a previously successful client disconnects", async () => {
    expect(await connectRedis()).toBe(redis);
    expect(mock.client.connect).toHaveBeenCalledTimes(1);

    mock.client.isReady = false;
    expect(await connectRedis()).toBe(redis);
    expect(mock.client.connect).toHaveBeenCalledTimes(2);
  });
});
