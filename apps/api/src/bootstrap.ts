import bcrypt from "bcryptjs";
import { config } from "./config";
import { query, transaction } from "./db";

export async function bootstrapProduction(): Promise<void> {
  if (config.NODE_ENV !== "production") return;

  const existing = await query<{ count: number }>("SELECT count(*)::int AS count FROM users");
  if ((existing.rows[0]?.count ?? 0) === 0) {
    if (!config.BOOTSTRAP_ADMIN_PASSWORD) {
      throw new Error("BOOTSTRAP_ADMIN_PASSWORD is required for the first production startup");
    }

    const passwordHash = await bcrypt.hash(config.BOOTSTRAP_ADMIN_PASSWORD, 12);
    await transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["atlas-production-bootstrap"]);
      const users = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM users");
      if ((users.rows[0]?.count ?? 0) > 0) return;

      const company = await client.query<{ id: string }>(
        "INSERT INTO companies (name) VALUES ($1) RETURNING id",
        [config.BOOTSTRAP_COMPANY_NAME]
      );
      const companyId = company.rows[0]!.id;
      const department = await client.query<{ id: string }>(
        "INSERT INTO departments (company_id, name) VALUES ($1, 'Administration') RETURNING id",
        [companyId]
      );
      await client.query(
        `INSERT INTO users
          (company_id, department_id, username, password_hash, role, status, full_name,
           specialty, job_title, job_description)
         VALUES ($1,$2,$3,$4,'DIRECTOR','ACTIVE',$5,'Operations','Managing Director',
                 'Company strategy, operations and governance.')`,
        [companyId, department.rows[0]!.id, config.BOOTSTRAP_ADMIN_USERNAME.toLowerCase(), passwordHash, config.BOOTSTRAP_ADMIN_NAME]
      );
    });
    console.log(`Created initial production director account: ${config.BOOTSTRAP_ADMIN_USERNAME}`);
  }

  await ensureDefaultCatalogs();
}

export async function ensureDefaultCatalogs(): Promise<void> {
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO deal_stages (company_id, key, name, color, sort_order, is_closed)
       SELECT c.id, stage.key, stage.name, stage.color, stage.sort_order, stage.is_closed
       FROM companies c
       CROSS JOIN (VALUES
         ('APPLICATION', 'Application', '#2563EB', 10, false),
         ('NEGOTIATION', 'Negotiation', '#D97706', 20, false),
         ('INVOICE', 'Invoice sent', '#7C3AED', 30, false),
         ('PAYMENT', 'Payment', '#059669', 40, true),
         ('SHIPMENT', 'Shipment', '#0891B2', 50, true),
         ('LOST', 'Lost', '#DC2626', 60, true)
       ) AS stage(key, name, color, sort_order, is_closed)
       ON CONFLICT (company_id, key) DO NOTHING`
    );
    await client.query(
      `INSERT INTO achievement_definitions (company_id, code, name, description, icon, points)
       SELECT c.id, achievement.code, achievement.name, achievement.description, achievement.icon, achievement.points
       FROM companies c
       CROSS JOIN (VALUES
         ('ON_TIME_10', 'On-time streak', 'Completed 10 tasks in a row on time.', 'target', 100),
         ('ZERO_OVERDUE', 'Clear runway', 'Finished the month with no overdue tasks.', 'sparkles', 150),
         ('TOP_MONTH', 'Top result', 'Highest weighted KPI result this month.', 'trophy', 250)
       ) AS achievement(code, name, description, icon, points)
       ON CONFLICT (company_id, code) DO NOTHING`
    );
  });
}
