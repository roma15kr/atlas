-- The company's Stripe subscription, kept in step by Stripe's webhook. No card data or invoice contents are stored.
CREATE TABLE company_subscriptions (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL UNIQUE,
  stripe_subscription_id text UNIQUE,
  plan text CHECK (plan IN ('STANDARD', 'STANDARD_AI')),
  period text CHECK (period IN ('MONTH', 'YEAR')),
  status text,
  quantity integer,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  -- Set when a charge fails, cleared when an invoice is paid; reminders repeat every 3 days in between.
  payment_failed_at timestamptz,
  last_reminder_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Stripe may deliver an event more than once; each is handled once.
CREATE TABLE stripe_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
