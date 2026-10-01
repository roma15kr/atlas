-- Rule-generated alerts with deduplication and resolution; recurring report runs with history.
ALTER TABLE alerts
  ADD COLUMN rule text,
  ADD COLUMN dedupe_key text,
  ADD COLUMN resolved_at timestamptz,
  ADD COLUMN deal_id uuid REFERENCES deals(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX alerts_open_dedupe ON alerts (company_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND resolved_at IS NULL;
CREATE INDEX alerts_open_rule_idx ON alerts (company_id, rule) WHERE resolved_at IS NULL;

ALTER TABLE reports
  ADD COLUMN active boolean NOT NULL DEFAULT true,
  ADD COLUMN next_run_at timestamptz,
  ADD COLUMN last_run_at timestamptz;

-- Next 06:00 in Kyiv after now for each schedule.
CREATE OR REPLACE FUNCTION report_next_run(schedule text, after timestamptz) RETURNS timestamptz AS $$
DECLARE
  local_day date := (after AT TIME ZONE 'Europe/Kyiv')::date;
  candidate date;
BEGIN
  IF schedule = 'DAILY' THEN
    candidate := local_day + 1;
  ELSIF schedule = 'WEEKLY' THEN
    candidate := local_day + (8 - extract(isodow FROM local_day)::int);
  ELSIF schedule = 'MONTHLY' THEN
    candidate := (date_trunc('month', local_day) + interval '1 month')::date;
  ELSE
    RETURN NULL;
  END IF;
  RETURN (candidate + time '06:00') AT TIME ZONE 'Europe/Kyiv';
END;
$$ LANGUAGE plpgsql STABLE;

UPDATE reports SET next_run_at = report_next_run(schedule::text, now()) WHERE schedule::text <> 'ONCE';

CREATE TABLE report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_runs_report_idx ON report_runs (report_id, created_at DESC);

INSERT INTO report_runs (report_id, company_id, period_start, period_end, result, created_at)
SELECT id, company_id, period_start, period_end, result, created_at FROM reports WHERE result IS NOT NULL;
