-- Every AI analysis returned to a user (from the model or the rule fallback), kept inside Atlas.
CREATE TABLE ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('ADVICE', 'EVALUATION', 'FORECAST')),
  summary text NOT NULL,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(recommendations) = 'array'),
  source text NOT NULL CHECK (source IN ('AI', 'RULES')),
  model text,
  fallback_reason text,
  -- The aggregated figures the analysis was based on; never names, messages or client data.
  metrics jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_analyses_subject_idx ON ai_analyses (subject_id, created_at DESC);
CREATE INDEX ai_analyses_company_idx ON ai_analyses (company_id, created_at DESC);
