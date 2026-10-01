-- Email client: each user's own mailboxes (IMAP/SMTP, Google or Microsoft), a synced copy of
-- their mail, drafts, and thread links to CRM clients and deals. Mail is private to its owner;
-- a thread linked to a client or deal is readable through that record's history.
CREATE TABLE mail_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('IMAP', 'GOOGLE', 'MICROSOFT')),
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
  display_name text,
  imap_host text NOT NULL,
  imap_port integer NOT NULL CHECK (imap_port IN (993, 143)),
  imap_security text NOT NULL CHECK (imap_security IN ('SSL', 'STARTTLS')),
  smtp_host text NOT NULL,
  smtp_port integer NOT NULL CHECK (smtp_port IN (465, 587, 25)),
  smtp_security text NOT NULL CHECK (smtp_security IN ('SSL', 'STARTTLS')),
  username text NOT NULL,
  -- AES-256-GCM sealed password or OAuth refresh token: {keyId, iv, tag, data}. Never returned by the API.
  secret jsonb NOT NULL,
  signature text CHECK (signature IS NULL OR length(signature) <= 2000),
  status text NOT NULL DEFAULT 'CONNECTED' CHECK (status IN ('CONNECTED', 'NEEDS_ATTENTION')),
  status_reason text,
  failures integer NOT NULL DEFAULT 0,
  last_synced_at timestamptz,
  next_sync_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX mail_accounts_user_email_unique ON mail_accounts (user_id, lower(email));
CREATE INDEX mail_accounts_due_idx ON mail_accounts (next_sync_at) WHERE status = 'CONNECTED';
CREATE TRIGGER mail_accounts_updated_at BEFORE UPDATE ON mail_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE mail_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
  path text NOT NULL,
  name text NOT NULL,
  -- ALL is Gmail's "All Mail": an archive target that is never synced, to avoid duplicates.
  special_use text CHECK (special_use IN ('INBOX', 'SENT', 'DRAFTS', 'ARCHIVE', 'JUNK', 'TRASH', 'ALL')),
  uidvalidity bigint,
  last_uid bigint NOT NULL DEFAULT 0,
  highest_modseq text,
  total integer NOT NULL DEFAULT 0,
  unread integer NOT NULL DEFAULT 0,
  synced_at timestamptz,
  UNIQUE (account_id, path)
);

CREATE TABLE mail_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- The mailbox owner. Kept after the mailbox is disconnected so linked history keeps its author.
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES mail_accounts(id) ON DELETE SET NULL,
  mailbox_email text NOT NULL,
  subject text NOT NULL DEFAULT '',
  -- Subject without Re:/Fwd: prefixes, lowercased; the last-resort thread match.
  subject_key text NOT NULL DEFAULT '',
  participants text[] NOT NULL DEFAULT '{}',
  provider_thread_id text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  message_count integer NOT NULL DEFAULT 0,
  unread_count integer NOT NULL DEFAULT 0,
  has_attachments boolean NOT NULL DEFAULT false,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES deals(id) ON DELETE SET NULL,
  link_source text CHECK (link_source IN ('AUTO', 'MANUAL')),
  autolink_blocked boolean NOT NULL DEFAULT false,
  link_suggestions uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mail_threads_account_time_idx ON mail_threads (account_id, last_message_at DESC);
CREATE INDEX mail_threads_client_idx ON mail_threads (client_id, last_message_at DESC) WHERE client_id IS NOT NULL;
CREATE INDEX mail_threads_deal_idx ON mail_threads (deal_id, last_message_at DESC) WHERE deal_id IS NOT NULL;
CREATE INDEX mail_threads_subject_idx ON mail_threads (account_id, subject_key, last_message_at DESC);
CREATE UNIQUE INDEX mail_threads_provider_unique ON mail_threads (account_id, provider_thread_id) WHERE provider_thread_id IS NOT NULL;

CREATE TABLE mail_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES mail_threads(id) ON DELETE CASCADE,
  account_id uuid REFERENCES mail_accounts(id) ON DELETE SET NULL,
  folder_id uuid REFERENCES mail_folders(id) ON DELETE SET NULL,
  uid bigint,
  message_id_header text,
  in_reply_to text,
  reference_ids text[] NOT NULL DEFAULT '{}',
  from_address text NOT NULL DEFAULT '',
  from_name text,
  to_addresses jsonb NOT NULL DEFAULT '[]',
  cc_addresses jsonb NOT NULL DEFAULT '[]',
  bcc_addresses jsonb NOT NULL DEFAULT '[]',
  reply_to jsonb NOT NULL DEFAULT '[]',
  subject text NOT NULL DEFAULT '',
  snippet text NOT NULL DEFAULT '',
  text_body text,
  -- Sanitized on ingest; remote images are deferred to data-remote-src.
  html_body text,
  has_remote_images boolean NOT NULL DEFAULT false,
  sent_at timestamptz NOT NULL DEFAULT now(),
  seen boolean NOT NULL DEFAULT false,
  flagged boolean NOT NULL DEFAULT false,
  answered boolean NOT NULL DEFAULT false,
  size integer NOT NULL DEFAULT 0,
  send_status text CHECK (send_status IN ('SENDING', 'SENT', 'FAILED')),
  send_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  search tsvector GENERATED ALWAYS AS (to_tsvector('simple',
    coalesce(subject, '') || ' ' || coalesce(from_name, '') || ' ' || coalesce(from_address, '') || ' ' ||
    to_addresses::text || ' ' || cc_addresses::text || ' ' || left(coalesce(text_body, ''), 100000))) STORED
);

CREATE UNIQUE INDEX mail_messages_folder_uid_unique ON mail_messages (folder_id, uid) WHERE folder_id IS NOT NULL AND uid IS NOT NULL;
CREATE INDEX mail_messages_thread_idx ON mail_messages (thread_id, sent_at);
CREATE INDEX mail_messages_header_idx ON mail_messages (account_id, message_id_header) WHERE message_id_header IS NOT NULL;
CREATE INDEX mail_messages_search_idx ON mail_messages USING gin (search);

CREATE TABLE mail_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,
  part_id text,
  filename text NOT NULL DEFAULT 'attachment',
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  size integer NOT NULL DEFAULT 0,
  content_id text,
  inline boolean NOT NULL DEFAULT false,
  stored_path text
);

CREATE INDEX mail_attachments_message_idx ON mail_attachments (message_id);

CREATE TABLE mail_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'NEW' CHECK (mode IN ('NEW', 'REPLY', 'REPLY_ALL', 'FORWARD')),
  source_message_id uuid REFERENCES mail_messages(id) ON DELETE SET NULL,
  to_addresses jsonb NOT NULL DEFAULT '[]',
  cc_addresses jsonb NOT NULL DEFAULT '[]',
  bcc_addresses jsonb NOT NULL DEFAULT '[]',
  subject text NOT NULL DEFAULT '',
  html text NOT NULL DEFAULT '',
  -- [{id, filename, contentType, size, storedPath}] uploads, plus forwarded attachment ids.
  attachments jsonb NOT NULL DEFAULT '[]',
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES deals(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mail_drafts_user_idx ON mail_drafts (user_id, updated_at DESC);

CREATE TABLE mail_oauth_states (
  nonce text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('GOOGLE', 'MICROSOFT')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

-- The placeholder inbox never had a working adapter; its rows are dropped (OPERATIONS asks for a dump first).
DROP TABLE messages;
DROP TYPE message_channel;
DROP TYPE message_direction;
DROP TYPE message_delivery_status;
