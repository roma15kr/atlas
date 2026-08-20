import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "./config";
import { pool } from "./db";

export async function runMigrations(directory = process.env.MIGRATIONS_DIR ?? "/app/database"): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const files = (await fs.readdir(directory))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .filter((name) => config.seedDemoData || !/_seed\.sql$/i.test(name))
    .sort();
  for (const name of files) {
    const sql = await fs.readFile(path.join(directory, name), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const applied = await pool.query<{ checksum: string }>(
      "SELECT checksum FROM schema_migrations WHERE name = $1",
      [name]
    );
    if (applied.rowCount) {
      if (applied.rows[0]?.checksum !== checksum) throw new Error(`Applied migration ${name} has changed`);
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [name, checksum]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
