-- Add usage tracking columns to profiles table
-- This enables daily message/screenshot limits and favorite management

-- Add usage tracking columns
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS screenshot_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS usage_reset_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS favorite_limit INTEGER DEFAULT 3;

-- Set favorite_limit based on existing plan
UPDATE profiles
SET favorite_limit = CASE 
  WHEN plan = 'pro' THEN 20
  ELSE 3
END;

-- Create function to reset daily usage
CREATE OR REPLACE FUNCTION reset_daily_usage()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Reset counts for users whose reset date has passed
  UPDATE profiles
  SET message_count = 0,
      screenshot_count = 0,
      usage_reset_date = CURRENT_DATE
  WHERE usage_reset_date < CURRENT_DATE;
  
  RAISE NOTICE 'Reset daily usage for % users', (SELECT COUNT(*) FROM profiles WHERE usage_reset_date = CURRENT_DATE);
END;
$$;

-- Schedule daily usage reset at midnight UTC using pg_cron
SELECT cron.schedule(
  'reset-daily-usage',           -- job name
  '0 0 * * *',                   -- cron expression: midnight daily
  $$SELECT reset_daily_usage();$$ -- SQL to run
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_plan ON profiles(plan);
CREATE INDEX IF NOT EXISTS idx_profiles_usage_reset_date ON profiles(usage_reset_date);

-- Create helper function to get usage limits based on plan
CREATE OR REPLACE FUNCTION get_usage_limits(user_plan TEXT)
RETURNS TABLE(
  max_messages INTEGER,
  max_screenshots INTEGER,
  max_favorites_in_context INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE WHEN user_plan = 'pro' THEN 500 ELSE 50 END AS max_messages,
    CASE WHEN user_plan = 'pro' THEN 50 ELSE 5 END AS max_screenshots,
    CASE WHEN user_plan = 'pro' THEN 20 ELSE 3 END AS max_favorites_in_context;
END;
$$;

-- Test the function
-- SELECT * FROM get_usage_limits('free');
-- SELECT * FROM get_usage_limits('pro');

-- To manually reset usage for testing:
-- UPDATE profiles SET message_count = 0, screenshot_count = 0, usage_reset_date = CURRENT_DATE WHERE id = 'your-user-id';

-- To view all scheduled jobs:
-- SELECT * FROM cron.job;

-- To check current usage:
-- SELECT id, email, plan, message_count, screenshot_count, usage_reset_date FROM profiles;
