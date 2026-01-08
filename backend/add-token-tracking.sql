-- Add token usage tracking to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS total_tokens_used BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_input_tokens BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_output_tokens BIGINT DEFAULT 0;

-- Create index for sorting by usage
CREATE INDEX IF NOT EXISTS idx_profiles_tokens ON profiles(total_tokens_used DESC);

-- Optional: Drop the old cost column if it exists
-- ALTER TABLE profiles DROP COLUMN IF EXISTS estimated_cost_usd;

-- Optional: View top users by token usage
-- SELECT email, total_tokens_used, total_input_tokens, total_output_tokens 
-- FROM profiles 
-- ORDER BY total_tokens_used DESC 
-- LIMIT 10;
