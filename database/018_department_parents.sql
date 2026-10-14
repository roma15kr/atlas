-- A department may sit under another department of the same company (one level only). The head of the
-- parent department then covers the sub-department too.
ALTER TABLE departments ADD COLUMN parent_id uuid REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE departments ADD CONSTRAINT departments_parent_not_self CHECK (parent_id IS NULL OR parent_id <> id);
CREATE INDEX departments_parent_idx ON departments (parent_id) WHERE parent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION enforce_department_nesting() RETURNS trigger AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM departments p WHERE p.id = NEW.parent_id AND p.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'department parent must belong to the same company' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM departments p WHERE p.id = NEW.parent_id AND p.parent_id IS NOT NULL) THEN
    RAISE EXCEPTION 'departments nest one level only' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM departments c WHERE c.parent_id = NEW.id) THEN
    RAISE EXCEPTION 'a department with sub-departments cannot be nested' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER departments_nesting BEFORE INSERT OR UPDATE OF parent_id ON departments
FOR EACH ROW EXECUTE FUNCTION enforce_department_nesting();
