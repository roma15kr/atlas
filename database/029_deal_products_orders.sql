-- Products in deals (from the BPI catalogue, as b2b.rdim.ua sells them) and the orders Atlas creates in BPI.
CREATE TABLE deal_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  position integer NOT NULL,
  bpi_product_id integer NOT NULL,
  -- A snapshot from the catalogue when the line was added; later catalogue changes don't rewrite the deal.
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 300),
  code text NOT NULL CHECK (char_length(code) <= 50),
  by_box boolean NOT NULL DEFAULT false,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100000),
  catalogue_price numeric(14,2) NOT NULL CHECK (catalogue_price >= 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deal_products_deal_idx ON deal_products (deal_id, position);

CREATE TABLE deal_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  -- Set once BPI answers; a retry first looks for an order already created with this row's marker.
  bpi_order_id integer,
  replaces_order_id integer,
  status text NOT NULL CHECK (status IN ('CREATING', 'SENT', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  -- The exact body sent to BPI (no credentials), for retries and support.
  request jsonb NOT NULL,
  sent_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX deal_orders_deal_idx ON deal_orders (deal_id, created_at DESC);
CREATE INDEX deal_orders_pending_idx ON deal_orders (next_attempt_at) WHERE status = 'CREATING';

ALTER TABLE deals ADD COLUMN products_locked boolean NOT NULL DEFAULT false;

-- Each employee's BPI staff account, matched by name or chosen by a director.
ALTER TABLE users ADD COLUMN bpi_manager_id integer;
ALTER TABLE users ADD COLUMN bpi_manager_source text CHECK (bpi_manager_source IN ('AUTO', 'DIRECTOR'));
