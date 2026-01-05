-- Add onboarded field to profiles table
-- Run this in your Supabase SQL editor

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS onboarded BOOLEAN DEFAULT false;

-- Add is_primary field to rulesets table
ALTER TABLE rulesets
ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_rulesets_user_primary 
ON rulesets(user_id, is_primary) 
WHERE is_primary = true;
