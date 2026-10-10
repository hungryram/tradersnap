-- Anonymous record of each deleted account (no email, name or user id) so churn
-- stays visible in the admin page after the user's data is gone
CREATE TABLE IF NOT EXISTS deleted_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signed_up_month DATE,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  plan TEXT,
  checks INTEGER NOT NULL DEFAULT 0,
  active_days INTEGER NOT NULL DEFAULT 0,
  trades INTEGER NOT NULL DEFAULT 0,
  platforms TEXT[],
  prop_firm BOOLEAN,
  experience TEXT,
  reason TEXT,
  details TEXT
);
ALTER TABLE deleted_accounts ENABLE ROW LEVEL SECURITY;
