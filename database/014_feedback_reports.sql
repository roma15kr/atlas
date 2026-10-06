-- Problem reports, complaints and ideas sent from any screen. Each becomes one GitHub issue
-- (anonymised English); the original text, screenshot and diagnostic log stay in Atlas.
CREATE TABLE feedback_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('PROBLEM', 'COMPLAINT', 'IDEA')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 10 AND 5000),
  page text NOT NULL CHECK (char_length(page) <= 300),
  app_version text CHECK (char_length(app_version) <= 80),
  user_agent text CHECK (char_length(user_agent) <= 500),
  viewport text CHECK (char_length(viewport) <= 40),
  diagnostics jsonb,
  screenshot_key text,
  screenshot_mime text CHECK (screenshot_mime IN ('image/png', 'image/jpeg', 'image/webp')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'ISSUE_CREATED', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz,
  last_error text,
  language text CHECK (language IN ('uk', 'ru', 'en', 'other')),
  title_en text,
  summary_en text,
  translation_en text,
  steps_en jsonb,
  category text CHECK (category IN ('BUG', 'COMPLAINT', 'IDEA', 'QUESTION')),
  severity text CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  area text,
  issue_number integer,
  issue_url text,
  triaged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_screenshot_complete CHECK ((screenshot_key IS NULL) = (screenshot_mime IS NULL)),
  CONSTRAINT feedback_issue_complete CHECK ((issue_number IS NULL) = (issue_url IS NULL))
);

CREATE INDEX feedback_reports_company_idx ON feedback_reports (company_id, created_at DESC);
CREATE INDEX feedback_reports_user_idx ON feedback_reports (user_id, created_at DESC);
CREATE INDEX feedback_reports_queue_idx ON feedback_reports (status, next_attempt_at) WHERE status IN ('PENDING', 'FAILED');

CREATE TRIGGER feedback_reports_updated_at BEFORE UPDATE ON feedback_reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
