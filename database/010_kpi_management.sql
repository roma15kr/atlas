-- KPI management: automatic sources with a period, and deal close dates that follow the stage outcome.
ALTER TABLE kpis
  ADD COLUMN source text NOT NULL DEFAULT 'MANUAL'
    CHECK (source IN ('MANUAL', 'DEALS_WON_VALUE', 'DEALS_WON_COUNT', 'TASKS_DONE', 'TASKS_ON_TIME_RATE')),
  ADD COLUMN period_start date,
  ADD COLUMN period_end date,
  ADD COLUMN created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN computed_at timestamptz,
  ADD CONSTRAINT kpis_period_order CHECK (period_end >= period_start),
  ADD CONSTRAINT kpis_auto_period CHECK (source = 'MANUAL' OR (period_start IS NOT NULL AND period_end IS NOT NULL));

-- Legacy rows may hold a zero target; only new and changed rows must have a positive one.
ALTER TABLE kpis ADD CONSTRAINT kpis_target_positive CHECK (target > 0) NOT VALID;

CREATE INDEX kpis_company_user_idx ON kpis (company_id, user_id);

UPDATE deals d SET closed_at = d.updated_at
FROM deal_stages s
WHERE s.id = d.stage_id AND s.outcome <> 'OPEN' AND d.closed_at IS NULL;

UPDATE deals d SET closed_at = NULL
FROM deal_stages s
WHERE s.id = d.stage_id AND s.outcome = 'OPEN' AND d.closed_at IS NOT NULL;

-- A deal's close date follows its stage: stamped on entering WON or LOST, cleared on reopening.
-- A trigger covers every path that moves deals, including stage deletion with relocation.
CREATE OR REPLACE FUNCTION deals_follow_stage_outcome() RETURNS trigger AS $$
DECLARE
  next_outcome text;
  previous_outcome text;
BEGIN
  SELECT outcome INTO next_outcome FROM deal_stages WHERE id = NEW.stage_id;
  IF next_outcome = 'OPEN' THEN
    NEW.closed_at := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.closed_at := COALESCE(NEW.closed_at, now());
  ELSE
    SELECT outcome INTO previous_outcome FROM deal_stages WHERE id = OLD.stage_id;
    IF NEW.closed_at IS DISTINCT FROM OLD.closed_at AND NEW.closed_at IS NOT NULL THEN
      NULL; -- an explicit close date wins
    ELSIF previous_outcome IS DISTINCT FROM next_outcome OR OLD.closed_at IS NULL THEN
      NEW.closed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deals_close_date BEFORE INSERT OR UPDATE OF stage_id, closed_at ON deals
  FOR EACH ROW EXECUTE FUNCTION deals_follow_stage_outcome();
