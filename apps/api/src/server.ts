import { createServer } from "node:http";
import { app } from "./app";
import { bootstrapProduction } from "./bootstrap";
import { config } from "./config";
import { pool } from "./db";
import { runMigrations } from "./migrations";
import { connectRedis, redis } from "./redis";
import { createSocketServer } from "./socket";

async function main(): Promise<void> {
  await runMigrations();
  await bootstrapProduction();
  await connectRedis();
  const server = createServer(app);
  const io = createSocketServer(server);
  server.listen(config.PORT, "0.0.0.0", () => {
    console.log(`Atlas API listening on ${config.PORT}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`Received ${signal}; shutting down`);
    io.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (redis.isOpen) await redis.quit();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void main().catch((error) => {
  console.error("Atlas API failed to start", error);
  process.exit(1);
});
