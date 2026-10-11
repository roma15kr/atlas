-- Images pasted into formatted text. Served only to signed-in users of the same company, by an unguessable id.
CREATE TABLE rich_text_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  storage_key text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rich_text_images_company_idx ON rich_text_images (company_id, created_at DESC);
