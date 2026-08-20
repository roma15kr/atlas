WITH company AS (
  INSERT INTO companies (name) VALUES ('Atlas Demo Company') RETURNING id
), sales AS (
  INSERT INTO departments (company_id, name)
  SELECT id, 'Sales' FROM company RETURNING id, company_id
), operations AS (
  INSERT INTO departments (company_id, name)
  SELECT id, 'Operations' FROM company RETURNING id, company_id
), seeded_users AS (
  INSERT INTO users (
    company_id, department_id, username, password_hash, role, full_name,
    specialty, job_title, job_description, monitoring_consent_at, monitoring_consent_version
  )
  SELECT company.id, operations.id, 'director', crypt('AtlasDemo2026!', gen_salt('bf', 12)),
         'DIRECTOR'::user_role, 'Elena Morozova', 'Operations', 'Managing Director',
         'Company strategy, operations and governance.', now(), '2026-01'
  FROM company, operations
  UNION ALL
  SELECT company.id, sales.id, 'manager', crypt('AtlasDemo2026!', gen_salt('bf', 12)),
         'MANAGER'::user_role, 'Mikhail Volkov', 'B2B Sales', 'Head of Sales',
         'Sales planning, coaching and pipeline ownership.', now(), '2026-01'
  FROM company, sales
  UNION ALL
  SELECT company.id, sales.id, 'employee', crypt('AtlasDemo2026!', gen_salt('bf', 12)),
         'EMPLOYEE'::user_role, 'Anna Petrova', 'Account Management', 'Account Executive',
         'Client acquisition and account development.', now(), '2026-01'
  FROM company, sales
  UNION ALL
  SELECT company.id, sales.id, 'alex', crypt('AtlasDemo2026!', gen_salt('bf', 12)),
         'EMPLOYEE'::user_role, 'Alex Kim', 'Business Development', 'Sales Executive',
         'Outbound sales and partner development.', NULL, NULL
  FROM company, sales
  RETURNING id, company_id, department_id, username
), seeded_stages AS (
  INSERT INTO deal_stages (company_id, key, name, color, sort_order, is_closed)
  SELECT company.id, stage.key, stage.name, stage.color, stage.sort_order, stage.is_closed
  FROM company
  CROSS JOIN (VALUES
    ('APPLICATION', 'Application', '#2563EB', 10, false),
    ('NEGOTIATION', 'Negotiation', '#D97706', 20, false),
    ('INVOICE', 'Invoice sent', '#7C3AED', 30, false),
    ('PAYMENT', 'Payment', '#059669', 40, true),
    ('SHIPMENT', 'Shipment', '#0891B2', 50, true),
    ('LOST', 'Lost', '#DC2626', 60, true)
  ) AS stage(key, name, color, sort_order, is_closed)
  RETURNING id
), seeded_clients AS (
  INSERT INTO clients (company_id, department_id, owner_id, name, company_name, email, phone, source, status, notes)
  SELECT u.company_id, u.department_id, u.id, 'Sofia Turner', 'Northstar Labs', 'sofia@northstar.example', '+1 555 010 220', 'Referral', 'ACTIVE', 'Expansion opportunity in Q4.'
  FROM seeded_users u WHERE u.username = 'employee'
  UNION ALL
  SELECT u.company_id, u.department_id, u.id, 'Noah Williams', 'Vertex Studio', 'noah@vertex.example', '+1 555 010 882', 'Website', 'NEW', 'Requested a product walkthrough.'
  FROM seeded_users u WHERE u.username = 'alex'
  UNION ALL
  SELECT u.company_id, u.department_id, u.id, 'Isabella Rossi', 'Arbor Group', 'isabella@arbor.example', '+39 02 555 018', 'Conference', 'ACTIVE', 'Procurement review underway.'
  FROM seeded_users u WHERE u.username = 'employee'
  RETURNING id, company_id, department_id, owner_id, company_name
), seeded_deals AS (
  INSERT INTO deals (company_id, department_id, client_id, owner_id, title, stage, value, currency, probability, expected_close_at)
  SELECT company_id, department_id, id, owner_id, company_name || ' annual plan', 'NEGOTIATION', 42000, 'USD', 70, now() + interval '18 days'
  FROM seeded_clients WHERE company_name = 'Northstar Labs'
  UNION ALL
  SELECT company_id, department_id, id, owner_id, company_name || ' starter plan', 'APPLICATION', 12500, 'USD', 25, now() + interval '32 days'
  FROM seeded_clients WHERE company_name = 'Vertex Studio'
  UNION ALL
  SELECT company_id, department_id, id, owner_id, company_name || ' renewal', 'INVOICE', 28750, 'EUR', 85, now() + interval '9 days'
  FROM seeded_clients WHERE company_name = 'Arbor Group'
  RETURNING id, company_id, department_id, owner_id, title
)
INSERT INTO tasks (company_id, department_id, assignee_id, created_by, deal_id, title, description, status, position, due_at)
SELECT d.company_id, d.department_id, d.owner_id, m.id, d.id, 'Prepare proposal for ' || d.title, 'Review scope and confirm commercial terms.', 'IN_PROGRESS'::task_status, 10, now() + interval '3 days'
FROM seeded_deals d
JOIN seeded_users m ON m.username = 'manager' AND m.company_id = d.company_id
UNION ALL
SELECT u.company_id, u.department_id, u.id, u.id, NULL, 'Update weekly pipeline', 'Make sure next steps are current for every account.', 'TODO'::task_status, 20, now() + interval '5 days'
FROM seeded_users u WHERE u.username IN ('employee', 'alex');

INSERT INTO kpis (company_id, user_id, name, target, actual, unit, weight, due_at)
SELECT company_id, id, 'Revenue closed', 75000, 48500, 'USD', 0.60, date_trunc('month', now()) + interval '1 month - 1 day'
FROM users WHERE username = 'employee'
UNION ALL
SELECT company_id, id, 'Qualified meetings', 20, 14, 'meetings', 0.40, date_trunc('month', now()) + interval '1 month - 1 day'
FROM users WHERE username = 'employee'
UNION ALL
SELECT company_id, id, 'Revenue closed', 65000, 22000, 'USD', 0.60, date_trunc('month', now()) + interval '1 month - 1 day'
FROM users WHERE username = 'alex';

INSERT INTO achievement_definitions (company_id, code, name, description, icon, points)
SELECT id, 'ON_TIME_10', 'On-time streak', 'Completed 10 tasks in a row on time.', 'target', 100 FROM companies
UNION ALL SELECT id, 'ZERO_OVERDUE', 'Clear runway', 'Finished the month with no overdue tasks.', 'sparkles', 150 FROM companies
UNION ALL SELECT id, 'TOP_MONTH', 'Top result', 'Highest weighted KPI result this month.', 'trophy', 250 FROM companies;

INSERT INTO user_achievements (user_id, achievement_id, awarded_at)
SELECT u.id, a.id, now() - interval '4 days'
FROM users u
JOIN achievement_definitions a ON a.company_id = u.company_id
WHERE u.username = 'employee' AND a.code IN ('ON_TIME_10', 'ZERO_OVERDUE');

INSERT INTO alerts (company_id, department_id, user_id, severity, category, title, summary, evidence, created_at)
SELECT u.company_id, u.department_id, u.id, 'WARNING', 'DEADLINE_RISK', 'Pipeline follow-up at risk',
       'Two active deals have next steps due this week.', '{"openDeals": 2, "windowDays": 7}'::jsonb, now() - interval '2 hours'
FROM users u WHERE u.username = 'employee'
UNION ALL
SELECT u.company_id, u.department_id, u.id, 'INFO', 'CONSENT', 'Monitoring consent pending',
       'A team member has not accepted the current monitoring policy.', '{"policyVersion": "2026-01"}'::jsonb, now() - interval '1 day'
FROM users u WHERE u.username = 'alex';

INSERT INTO integrations (company_id, user_id, provider, status, display_name, last_synced_at)
SELECT company_id, id, 'GMAIL', 'CONNECTED'::integration_status, username || '@atlas-demo.example', now() - interval '8 minutes'
FROM users WHERE username = 'employee'
UNION ALL
SELECT company_id, id, 'TELEGRAM', 'DISCONNECTED'::integration_status, NULL, NULL FROM users WHERE username = 'employee'
UNION ALL
SELECT id, NULL, 'WHATSAPP', 'NEEDS_ATTENTION'::integration_status, 'Atlas Demo Support', now() - interval '2 days' FROM companies;

INSERT INTO reports (company_id, department_id, created_by, target_user_id, name, metrics, period_start, period_end, schedule, status, result)
SELECT m.company_id, m.department_id, m.id, e.id, 'Weekly sales pulse', '["deals", "conversion", "kpi"]'::jsonb,
       current_date - 7, current_date, 'WEEKLY', 'READY', '{"dealsCreated": 3, "conversion": 0.34, "kpiProgress": 0.68}'::jsonb
FROM users m JOIN users e ON e.company_id = m.company_id
WHERE m.username = 'manager' AND e.username = 'employee';

INSERT INTO messages
  (company_id, department_id, user_id, client_id, channel, direction, delivery_status, sender, recipient, subject, body, occurred_at)
SELECT u.company_id, u.department_id, u.id, c.id, 'GMAIL'::message_channel, 'INBOUND'::message_direction, 'RECEIVED'::message_delivery_status,
       'Sofia Turner', u.full_name, 'Northstar renewal', 'Can we review the final scope during our Thursday call?', now() - interval '3 hours'
FROM users u JOIN clients c ON c.owner_id = u.id AND c.company_name = 'Northstar Labs'
WHERE u.username = 'employee'
UNION ALL
SELECT u.company_id, u.department_id, u.id, c.id, 'GMAIL'::message_channel, 'OUTBOUND'::message_direction, 'SENT'::message_delivery_status,
       u.full_name, 'Isabella Rossi', 'Procurement checklist', 'The updated procurement checklist is ready for your review.', now() - interval '1 day'
FROM users u JOIN clients c ON c.owner_id = u.id AND c.company_name = 'Arbor Group'
WHERE u.username = 'employee';
