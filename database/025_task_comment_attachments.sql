-- Files attached to task comments (tasks «Task comment attachments»), like chat attachments: an upload stays unlinked
-- (comment_id NULL) until the comment is posted; unposted uploads are cleaned up after a day. Rows go with their task or
-- comment; stored objects are removed by the API.
CREATE TABLE task_comment_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES task_comments(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0),
  storage_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_comment_attachments_comment_idx ON task_comment_attachments (comment_id);
CREATE INDEX task_comment_attachments_task_idx ON task_comment_attachments (task_id);
CREATE INDEX task_comment_attachments_unlinked_idx ON task_comment_attachments (created_at) WHERE comment_id IS NULL;

-- A comment may now be files only: its text can be empty (the API still requires text or at least one file).
ALTER TABLE task_comments DROP CONSTRAINT task_comments_body_check;
ALTER TABLE task_comments ADD CONSTRAINT task_comments_body_check CHECK (char_length(body) <= 5000);
