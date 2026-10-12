-- The "your trial ends soon" email goes out once per account
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_ending_email_sent_at TIMESTAMPTZ;
