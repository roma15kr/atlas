-- Telegram customer inbox: the company bot's private chats, each a contact routed to a responsible
-- user and optionally bound to a CRM client. Access follows record scope through the responsible user.
CREATE TABLE telegram_settings (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  bot_username text,
  greeting_text text NOT NULL DEFAULT 'Здравствуйте! Напишите ваш вопрос — менеджер ответит вам здесь.' CHECK (length(greeting_text) BETWEEN 1 AND 1000),
  welcome_text text NOT NULL DEFAULT 'Спасибо! Теперь ваш менеджер будет отвечать вам в этом чате.' CHECK (length(welcome_text) BETWEEN 1 AND 1000),
  default_responsible_id uuid REFERENCES users(id) ON DELETE SET NULL,
  last_update_at timestamptz,
  last_error text,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE telegram_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- For private chats the chat id equals the user id.
  telegram_user_id bigint NOT NULL CHECK (telegram_user_id > 0),
  username text,
  first_name text,
  last_name text,
  language_code text,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  responsible_id uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Copied from the responsible user by trigger, for department scope.
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BLOCKED', 'UNVERIFIED')),
  bound_via text CHECK (bound_via IN ('IMPORT', 'INVITE', 'TRIAGE', 'DEFAULT')),
  greeted_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, telegram_user_id)
);

CREATE INDEX telegram_contacts_scope_idx ON telegram_contacts (company_id, department_id, responsible_id);
CREATE INDEX telegram_contacts_client_idx ON telegram_contacts (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX telegram_contacts_activity_idx ON telegram_contacts (company_id, last_message_at DESC NULLS LAST);
CREATE TRIGGER telegram_contacts_updated_at BEFORE UPDATE ON telegram_contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION telegram_contact_department() RETURNS trigger AS $$
BEGIN
  NEW.department_id := (SELECT department_id FROM users WHERE id = NEW.responsible_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER telegram_contact_department BEFORE INSERT OR UPDATE OF responsible_id ON telegram_contacts
  FOR EACH ROW EXECUTE FUNCTION telegram_contact_department();

-- A responsible user who moves department takes their contacts along; a disabled one hands them back to triage.
CREATE FUNCTION users_telegram_contacts() RETURNS trigger AS $$
BEGIN
  IF NEW.status <> 'ACTIVE' THEN
    UPDATE telegram_contacts SET responsible_id = NULL WHERE responsible_id = NEW.id;
  ELSIF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
    UPDATE telegram_contacts SET department_id = NEW.department_id WHERE responsible_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_telegram_contacts AFTER UPDATE OF status, department_id ON users
  FOR EACH ROW EXECUTE FUNCTION users_telegram_contacts();

CREATE TABLE telegram_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES telegram_contacts(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('IN', 'OUT')),
  telegram_message_id bigint,
  reply_to_id uuid REFERENCES telegram_messages(id) ON DELETE SET NULL,
  text text,
  kind text NOT NULL DEFAULT 'TEXT' CHECK (kind IN ('TEXT', 'PHOTO', 'DOCUMENT', 'VOICE', 'AUDIO', 'VIDEO', 'VIDEO_NOTE', 'STICKER', 'LOCATION', 'CONTACT', 'OTHER')),
  file_id text,
  file_name text,
  mime_type text,
  file_size bigint,
  stored_path text,
  file_too_large boolean NOT NULL DEFAULT false,
  summary text,
  sent_by uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('RECEIVED', 'SENDING', 'SENT', 'FAILED')),
  error text,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX telegram_messages_dedupe ON telegram_messages (contact_id, direction, telegram_message_id) WHERE telegram_message_id IS NOT NULL;
CREATE INDEX telegram_messages_contact_time_idx ON telegram_messages (contact_id, created_at DESC, id DESC);

CREATE TABLE telegram_reads (
  contact_id uuid NOT NULL REFERENCES telegram_contacts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, user_id)
);

CREATE TABLE telegram_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  -- SHA-256 of the start token; the token itself is never stored.
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by_contact uuid REFERENCES telegram_contacts(id) ON DELETE SET NULL,
  conflict_client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE telegram_deal_links (
  contact_id uuid NOT NULL REFERENCES telegram_contacts(id) ON DELETE CASCADE,
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  linked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, deal_id)
);

CREATE INDEX telegram_deal_links_deal_idx ON telegram_deal_links (deal_id);

-- Every update Telegram delivered, for exactly-once processing and retries; pruned after 7 days.
CREATE TABLE telegram_updates (
  update_id bigint PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX telegram_updates_pending_idx ON telegram_updates (received_at) WHERE processed_at IS NULL;
