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
    // Seed a funnel only for companies without one, so stages a director edited or deleted stay that way.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["atlas-default-funnels"]);
    await client.query(
      `WITH created AS (
         INSERT INTO deal_funnels (company_id, name, sort_order, access_mode)
         SELECT c.id, 'Основная воронка', 10, 'COMPANY' FROM companies c
         WHERE NOT EXISTS (SELECT 1 FROM deal_funnels f WHERE f.company_id = c.id)
         RETURNING id, company_id
       )
       INSERT INTO deal_stages (company_id, funnel_id, name, color, sort_order, outcome)
       SELECT created.company_id, created.id, stage.name, stage.color, stage.sort_order, stage.outcome
       FROM created
       CROSS JOIN (VALUES
         ('Заявка', '#2563EB', 10, 'OPEN'),
         ('Переговоры', '#D97706', 20, 'OPEN'),
         ('Счёт выставлен', '#7C3AED', 30, 'OPEN'),
         ('Оплата', '#059669', 40, 'WON'),
         ('Отгрузка', '#0891B2', 50, 'WON'),
         ('Проиграна', '#DC2626', 60, 'LOST')
       ) AS stage(name, color, sort_order, outcome)`
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
