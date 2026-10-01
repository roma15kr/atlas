/**
 * An in-process Postgres (PGlite) with the real migrations, plus helpers to create a company,
 * departments and signed-in users. Import this module before anything that reads the config.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Role } from "../types";

const port = 50000 + Math.floor(Math.random() * 12000);
Object.assign(process.env, {
  POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: String(port), POSTGRES_USER: "postgres", POSTGRES_PASSWORD: "postgres", POSTGRES_DB: "postgres",
  MAIL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), MAIL_SCHEDULER: "off", AUTOMATION_INTERVAL_MS: "0", SEED_DEMO_DATA: "false",
  STORAGE_DIR: mkdtempSync(path.join(tmpdir(), "atlas-db-")), PUBLIC_URL: "http://localhost:8080"
});

export interface TestUser { id: string; token: string; departmentId: string | null; role: Role }

export async function startDbHarness() {
  const { PGlite } = await import("@electric-sql/pglite");
  const { pgcrypto } = await import("@electric-sql/pglite/contrib/pgcrypto");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  const db = await PGlite.create({ extensions: { pgcrypto } });
  const pg = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 50 });
  await pg.start();
  const { runMigrations } = await import("../migrations");
  await runMigrations(path.resolve(__dirname, "../../../../database"));
  const { query, pool } = await import("../db");
  const { signAccessToken } = await import("../auth");

  const company = (await query<{ id: string }>("INSERT INTO companies (name) VALUES ('Test') RETURNING id")).rows[0]!.id;
  const departments = new Map<string, string>();

  async function department(name: string): Promise<string> {
    const known = departments.get(name);
    if (known) return known;
    const id = (await query<{ id: string }>("INSERT INTO departments (company_id, name) VALUES ($1, $2) RETURNING id", [company, name])).rows[0]!.id;
    departments.set(name, id);
    return id;
  }

  /** Creates an ACTIVE user. `passwordHash` defaults to a hash that matches no password. */
  async function user(username: string, role: Role, departmentName: string | null, options: { passwordHash?: string; consent?: boolean } = {}): Promise<TestUser> {
    const departmentId = departmentName ? await department(departmentName) : null;
    const id = (await query<{ id: string }>(
      `INSERT INTO users (company_id, department_id, username, password_hash, role, full_name, monitoring_consent_at, monitoring_consent_version)
       VALUES ($1, $2, $3, $4, $5, $3, CASE WHEN $6 THEN now() END, CASE WHEN $6 THEN '2026-01' END) RETURNING id`,
      [company, departmentId, username, options.passwordHash ?? "x", role, options.consent ?? false]
    )).rows[0]!.id;
    return { id, departmentId, role, token: signAccessToken({ userId: id, companyId: company, departmentId, username, role }) };
  }

  return {
    query, company, department, user,
    async stop() {
      await pool.end();
      await pg.stop();
    }
  };
}
