-- A task is shared on its board (default, and every existing task) or personal: then only its author, its
-- assignees, the heads covering their departments and directors see it.
ALTER TABLE tasks ADD COLUMN on_board boolean NOT NULL DEFAULT true;
