-- Add first_name and last_name to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Update existing profiles to have default values (optional)
-- UPDATE profiles SET first_name = '', last_name = '' WHERE first_name IS NULL;
