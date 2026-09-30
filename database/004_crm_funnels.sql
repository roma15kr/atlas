CREATE TABLE deal_funnels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  access_mode text NOT NULL DEFAULT 'COMPANY' CHECK (access_mode IN ('COMPANY', 'RESTRICTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX deal_funnels_company_name_unique ON deal_funnels (company_id, lower(name));
CREATE TRIGGER deal_funnels_updated_at BEFORE UPDATE ON deal_funnels FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE deal_funnel_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES deal_funnels(id) ON DELETE CASCADE,
  department_id uuid REFERENCES departments(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(department_id, user_id) = 1),
  UNIQUE (funnel_id, department_id),
  UNIQUE (funnel_id, user_id)
);

CREATE INDEX deal_funnel_access_funnel_idx ON deal_funnel_access (funnel_id);
CREATE INDEX deal_funnel_access_user_idx ON deal_funnel_access (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX deal_funnel_access_department_idx ON deal_funnel_access (department_id) WHERE department_id IS NOT NULL;

-- One company-wide default funnel per existing company keeps current access unchanged.
INSERT INTO deal_funnels (company_id, name, sort_order, access_mode)
SELECT id, 'Основная воронка', 10, 'COMPANY' FROM companies;

ALTER TABLE deal_stages
  ADD COLUMN funnel_id uuid REFERENCES deal_funnels(id) ON DELETE CASCADE,
  ADD COLUMN outcome text;

UPDATE deal_stages ds
SET funnel_id = f.id,
    outcome = CASE WHEN NOT ds.is_closed THEN 'OPEN' WHEN ds.key = 'LOST' THEN 'LOST' ELSE 'WON' END
FROM deal_funnels f
WHERE f.company_id = ds.company_id;

-- Deals could reference a stage key with no stage row; keep them visible in an open stage of that name.
INSERT INTO deal_stages (company_id, funnel_id, key, name, color, sort_order, is_closed, outcome)
SELECT orphan.company_id, f.id, orphan.stage, orphan.stage, '#6B7280',
       COALESCE((SELECT max(s.sort_order) FROM deal_stages s WHERE s.company_id = orphan.company_id), 0)
         + 10 * row_number() OVER (PARTITION BY orphan.company_id ORDER BY orphan.stage),
       false, 'OPEN'
FROM (
  SELECT DISTINCT d.company_id, d.stage
  FROM deals d
  WHERE NOT EXISTS (SELECT 1 FROM deal_stages s WHERE s.company_id = d.company_id AND s.key = d.stage)
) orphan
JOIN deal_funnels f ON f.company_id = orphan.company_id;

-- Stage names become unique per funnel; disambiguate historical duplicates with their key.
UPDATE deal_stages ds
SET name = ds.name || ' (' || ds.key || ')'
WHERE EXISTS (
  SELECT 1 FROM deal_stages other
  WHERE other.funnel_id = ds.funnel_id AND other.id <> ds.id AND lower(other.name) = lower(ds.name)
);

-- Companies that never had stages still need a usable funnel.
INSERT INTO deal_stages (company_id, funnel_id, key, name, color, sort_order, is_closed, outcome)
SELECT f.company_id, f.id, stage.key, stage.name, stage.color, stage.sort_order, stage.outcome <> 'OPEN', stage.outcome
FROM deal_funnels f
CROSS JOIN (VALUES
  ('APPLICATION', 'Заявка', '#2563EB', 10, 'OPEN'),
  ('NEGOTIATION', 'Переговоры', '#D97706', 20, 'OPEN'),
  ('INVOICE', 'Счёт выставлен', '#7C3AED', 30, 'OPEN'),
  ('PAYMENT', 'Оплата', '#059669', 40, 'WON'),
  ('SHIPMENT', 'Отгрузка', '#0891B2', 50, 'WON'),
  ('LOST', 'Проиграна', '#DC2626', 60, 'LOST')
) AS stage(key, name, color, sort_order, outcome)
WHERE NOT EXISTS (SELECT 1 FROM deal_stages s WHERE s.funnel_id = f.id);

ALTER TABLE deal_stages
  ALTER COLUMN funnel_id SET NOT NULL,
  ALTER COLUMN outcome SET NOT NULL,
  ADD CONSTRAINT deal_stages_outcome_check CHECK (outcome IN ('OPEN', 'WON', 'LOST')),
  ADD CONSTRAINT deal_stages_id_funnel_unique UNIQUE (id, funnel_id);

CREATE UNIQUE INDEX deal_stages_funnel_name_unique ON deal_stages (funnel_id, lower(name));
CREATE INDEX deal_stages_funnel_order_idx ON deal_stages (funnel_id, sort_order);

ALTER TABLE deals
  ADD COLUMN funnel_id uuid,
  ADD COLUMN stage_id uuid;

UPDATE deals d
SET funnel_id = s.funnel_id, stage_id = s.id
FROM deal_stages s
WHERE s.company_id = d.company_id AND s.key = d.stage;

ALTER TABLE deals
  ALTER COLUMN funnel_id SET NOT NULL,
  ALTER COLUMN stage_id SET NOT NULL,
  ADD CONSTRAINT deals_funnel_fk FOREIGN KEY (funnel_id) REFERENCES deal_funnels(id) ON DELETE RESTRICT,
  ADD CONSTRAINT deals_stage_in_funnel_fk FOREIGN KEY (stage_id, funnel_id)
    REFERENCES deal_stages (id, funnel_id) ON DELETE RESTRICT,
  DROP COLUMN stage;

CREATE INDEX deals_funnel_stage_idx ON deals (funnel_id, stage_id);

ALTER TABLE deal_stages
  DROP CONSTRAINT deal_stages_company_id_key_key,
  DROP COLUMN key,
  DROP COLUMN is_closed;
