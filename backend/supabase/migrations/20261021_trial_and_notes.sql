-- New plans: a 7-day Pro trial for every new account (no card), and notes on
-- journal days. Plan limits live in backend/lib/plans.ts; "pro_plus" is a new
-- value for profiles.plan (no constraint to change).

-- Trial: Free accounts get Pro until trial_ends_at
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE profiles ALTER COLUMN trial_ends_at SET DEFAULT (NOW() + INTERVAL '7 days');
-- Existing Free accounts start their trial now
UPDATE profiles SET trial_ends_at = NOW() + INTERVAL '7 days'
WHERE trial_ends_at IS NULL AND (plan IS NULL OR plan = 'free');

-- One note per trader per trading day (their local date)
CREATE TABLE IF NOT EXISTS journal_notes (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  text TEXT NOT NULL CHECK (char_length(text) <= 4000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, day)
);
ALTER TABLE journal_notes ENABLE ROW LEVEL SECURITY;
