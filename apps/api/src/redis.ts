import { createClient, type RedisClientType } from "redis";
import { config } from "./config";

export const redis: RedisClientType = createClient(config.REDIS_URL ? {
  url: config.REDIS_URL,
  socket: { connectTimeout: 2_000, reconnectStrategy: false }
} : {
  password: config.REDIS_PASSWORD,
  socket: {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    connectTimeout: 2_000,
    reconnectStrategy: false
  }
});
let connecting: Promise<RedisClientType> | null = null;

redis.on("error", (error) => {
  if (config.NODE_ENV !== "test") console.warn("Redis connection error", error.message);
});

export async function connectRedis(): Promise<RedisClientType | null> {
  if (redis.isReady) return redis;
  if (!connecting) {
    connecting = redis.connect().then(() => redis);
  }
  try {
    return await connecting;
  } catch (error) {
    if (config.NODE_ENV !== "test") {
      console.warn("Redis unavailable; continuing without distributed presence", error instanceof Error ? error.message : error);
    }
    return null;
  } finally {
    connecting = null;
  }
}
