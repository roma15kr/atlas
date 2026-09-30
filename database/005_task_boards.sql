CREATE TABLE task_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- NULL is a director board: only directors and explicit members open it.
  department_id uuid REFERENCES departments(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX task_boards_department_name_unique
  ON task_boards (company_id, department_id, lower(name)) NULLS NOT DISTINCT;
CREATE INDEX task_boards_department_idx ON task_boards (department_id);
CREATE TRIGGER task_boards_updated_at BEFORE UPDATE ON task_boards FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE task_board_members (
  board_id uuid NOT NULL REFERENCES task_boards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, user_id)
);

CREATE INDEX task_board_members_user_idx ON task_board_members (user_id);

CREATE TABLE task_board_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES task_boards(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  color text NOT NULL DEFAULT '#6B7280',
  sort_order integer NOT NULL DEFAULT 0,
  category text NOT NULL CHECK (category IN ('TODO', 'ACTIVE', 'DONE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, board_id)
);

CREATE UNIQUE INDEX task_board_stages_board_name_unique ON task_board_stages (board_id, lower(name));
CREATE INDEX task_board_stages_board_order_idx ON task_board_stages (board_id, sort_order);
CREATE TRIGGER task_board_stages_updated_at BEFORE UPDATE ON task_board_stages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE task_assignees (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX task_assignees_user_idx ON task_assignees (user_id);

-- Every department, existing or created later, starts with a default board.
CREATE FUNCTION create_default_task_board(p_company_id uuid, p_department_id uuid, p_name text) RETURNS uuid AS $$
DECLARE
  new_board_id uuid;
BEGIN
  INSERT INTO task_boards (company_id, department_id, name, sort_order)
  VALUES (p_company_id, p_department_id, p_name, 10)
  RETURNING id INTO new_board_id;
  INSERT INTO task_board_stages (board_id, name, color, sort_order, category) VALUES
    (new_board_id, 'Нужно сделать', '#6B7280', 10, 'TODO'),
    (new_board_id, 'В работе', '#D97706', 20, 'ACTIVE'),
    (new_board_id, 'Готово', '#059669', 30, 'DONE');
  RETURN new_board_id;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION departments_default_task_board() RETURNS trigger AS $$
BEGIN
  PERFORM create_default_task_board(NEW.company_id, NEW.id, 'Задачи отдела');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

SELECT create_default_task_board(company_id, id, 'Задачи отдела') FROM departments;

CREATE TRIGGER departments_default_task_board AFTER INSERT ON departments
  FOR EACH ROW EXECUTE FUNCTION departments_default_task_board();

-- Department-less tasks move to one director board per company that has them.
SELECT create_default_task_board(c.id, NULL, 'Задачи руководства')
FROM companies c
WHERE EXISTS (SELECT 1 FROM tasks t WHERE t.company_id = c.id AND t.department_id IS NULL);

ALTER TABLE tasks
  ADD COLUMN board_id uuid,
  ADD COLUMN stage_id uuid;

UPDATE tasks t
SET board_id = b.id,
    stage_id = s.id
FROM task_boards b
JOIN task_board_stages s ON s.board_id = b.id
WHERE b.company_id = t.company_id
  AND b.department_id IS NOT DISTINCT FROM t.department_id
  AND s.category = CASE t.status WHEN 'TODO' THEN 'TODO' WHEN 'IN_PROGRESS' THEN 'ACTIVE' ELSE 'DONE' END;

INSERT INTO task_assignees (task_id, user_id)
SELECT id, assignee_id FROM tasks;

INSERT INTO task_board_members (board_id, user_id)
SELECT DISTINCT t.board_id, t.assignee_id
FROM tasks t
JOIN task_boards b ON b.id = t.board_id
WHERE b.department_id IS NULL;

ALTER TABLE tasks
  ALTER COLUMN board_id SET NOT NULL,
  ALTER COLUMN stage_id SET NOT NULL,
  ADD CONSTRAINT tasks_board_fk FOREIGN KEY (board_id) REFERENCES task_boards(id) ON DELETE RESTRICT,
  ADD CONSTRAINT tasks_stage_in_board_fk FOREIGN KEY (stage_id, board_id)
    REFERENCES task_board_stages (id, board_id) ON DELETE RESTRICT;

DROP INDEX tasks_scope_idx;
ALTER TABLE tasks
  DROP COLUMN status,
  DROP COLUMN assignee_id;
DROP TYPE task_status;

CREATE INDEX tasks_board_stage_idx ON tasks (board_id, stage_id, position);
CREATE INDEX tasks_company_department_idx ON tasks (company_id, department_id);
