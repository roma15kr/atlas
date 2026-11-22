-- The company's appearance: title, colours and logo files. No row means the standard Atlas look.
CREATE TABLE company_branding (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  app_name text NOT NULL DEFAULT 'Atlas' CHECK (char_length(btrim(app_name)) BETWEEN 1 AND 30),
  accent_color text NOT NULL DEFAULT '#176f68' CHECK (accent_color ~ '^#[0-9a-f]{6}$'),
  sidebar_color text NOT NULL DEFAULT '#1d2a28' CHECK (sidebar_color ~ '^#[0-9a-f]{6}$'),
  -- NULL means no logo; a new id with every upload, so file URLs can be cached for good.
  logo_version uuid,
  -- Storage keys of the logo and the icons made from it: logo, icon192, icon512, maskable512, apple180, badge96.
  logo_keys jsonb,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
