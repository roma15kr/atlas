-- Files attached to chat messages (team-chat «File attachments»). An upload stays unlinked (message_id NULL) until the
-- message is sent; unsent uploads are cleaned up after a day. Rows go with their message; objects are removed by the API.
CREATE TABLE chat_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES chat_messages(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0),
  storage_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_attachments_message_idx ON chat_attachments (message_id);
CREATE INDEX chat_attachments_unlinked_idx ON chat_attachments (created_at) WHERE message_id IS NULL;
