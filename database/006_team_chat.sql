-- Team chat: direct messages, group conversations and channels. Membership decides visibility;
-- a PUBLIC channel is additionally readable by everyone in its company.
CREATE TABLE chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('DM', 'GROUP', 'CHANNEL')),
  name text CHECK (name IS NULL OR length(btrim(name)) BETWEEN 1 AND 80),
  description text CHECK (description IS NULL OR length(description) <= 500),
  visibility text CHECK (visibility IN ('PUBLIC', 'PRIVATE')),
  is_default boolean NOT NULL DEFAULT false,
  -- The two participant ids of a DM, sorted and joined with ':'; one DM per pair.
  dm_key text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'CHANNEL') = (visibility IS NOT NULL)),
  CHECK (kind <> 'CHANNEL' OR name IS NOT NULL),
  CHECK ((kind = 'DM') = (dm_key IS NOT NULL)),
  CHECK (NOT is_default OR (kind = 'CHANNEL' AND visibility = 'PUBLIC' AND archived_at IS NULL))
);

CREATE UNIQUE INDEX chat_conversations_dm_unique ON chat_conversations (company_id, dm_key) WHERE dm_key IS NOT NULL;
CREATE UNIQUE INDEX chat_conversations_channel_name_unique
  ON chat_conversations (company_id, lower(name)) WHERE kind = 'CHANNEL' AND archived_at IS NULL;
CREATE UNIQUE INDEX chat_conversations_default_unique ON chat_conversations (company_id) WHERE is_default;
CREATE INDEX chat_conversations_company_kind_idx ON chat_conversations (company_id, kind);
CREATE TRIGGER chat_conversations_updated_at BEFORE UPDATE ON chat_conversations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE chat_members (
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('ADMIN', 'MEMBER')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  muted boolean NOT NULL DEFAULT false,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX chat_members_user_idx ON chat_members (user_id);

CREATE TABLE chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  parent_id uuid REFERENCES chat_messages(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) <= 4000),
  reply_count integer NOT NULL DEFAULT 0 CHECK (reply_count >= 0),
  last_reply_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- A deleted message keeps its place but not its text.
  CHECK (deleted_at IS NULL OR body = '')
);

CREATE INDEX chat_messages_conversation_time_idx ON chat_messages (conversation_id, created_at DESC, id DESC) WHERE parent_id IS NULL;
CREATE INDEX chat_messages_unread_idx ON chat_messages (conversation_id, created_at);
CREATE INDEX chat_messages_parent_idx ON chat_messages (parent_id, created_at) WHERE parent_id IS NOT NULL;

CREATE TABLE chat_mentions (
  message_id uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamptz,
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX chat_mentions_user_unread_idx ON chat_mentions (user_id) WHERE read_at IS NULL;

-- Every company has one public "Общий" channel with every active user; directors are its admins.
CREATE FUNCTION chat_default_channel(p_company_id uuid) RETURNS uuid AS $$
DECLARE
  channel_id uuid;
BEGIN
  SELECT id INTO channel_id FROM chat_conversations WHERE company_id = p_company_id AND is_default;
  IF channel_id IS NULL THEN
    INSERT INTO chat_conversations (company_id, kind, name, description, visibility, is_default)
    VALUES (p_company_id, 'CHANNEL', 'Общий', 'Канал для всей команды', 'PUBLIC', true)
    RETURNING id INTO channel_id;
  END IF;
  RETURN channel_id;
END;
$$ LANGUAGE plpgsql;

SELECT chat_default_channel(id) FROM companies;

INSERT INTO chat_members (conversation_id, user_id, role)
SELECT c.id, u.id, CASE WHEN u.role = 'DIRECTOR' THEN 'ADMIN' ELSE 'MEMBER' END
FROM users u JOIN chat_conversations c ON c.company_id = u.company_id AND c.is_default
WHERE u.status = 'ACTIVE';

CREATE FUNCTION users_chat_membership() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'ACTIVE' AND (TG_OP = 'INSERT' OR OLD.status <> 'ACTIVE' OR OLD.role IS DISTINCT FROM NEW.role) THEN
    INSERT INTO chat_members (conversation_id, user_id, role)
    VALUES (chat_default_channel(NEW.company_id), NEW.id, CASE WHEN NEW.role = 'DIRECTOR' THEN 'ADMIN' ELSE 'MEMBER' END)
    ON CONFLICT (conversation_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  ELSIF TG_OP = 'UPDATE' AND NEW.status <> 'ACTIVE' AND OLD.status = 'ACTIVE' THEN
    -- A deactivated user leaves every group and channel; DMs stay readable to the other person.
    DELETE FROM chat_members m USING chat_conversations c
    WHERE m.user_id = NEW.id AND c.id = m.conversation_id AND c.kind IN ('GROUP', 'CHANNEL');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_chat_membership AFTER INSERT OR UPDATE OF status, role ON users
  FOR EACH ROW EXECUTE FUNCTION users_chat_membership();
