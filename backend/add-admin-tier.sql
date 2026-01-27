-- Add admin tier to the database
-- This tier is for internal use only and should only be assigned to specific users

-- First, add a new column to track admin access
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Create an index for quick admin lookups
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON profiles(is_admin) WHERE is_admin = true;

-- Update the profiles table to allow 'admin' as a valid plan value
-- Note: The 'plan' column already accepts TEXT, so no schema change needed

-- Add a comment to document the admin tier
COMMENT ON COLUMN profiles.is_admin IS 'Admin flag for special tier with buy/sell signals access';

-- Function to check if a user is an admin
CREATE OR REPLACE FUNCTION is_user_admin(user_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  admin_status BOOLEAN;
BEGIN
  SELECT is_admin INTO admin_status
  FROM profiles
  WHERE email = user_email;
  
  RETURN COALESCE(admin_status, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- TODO: Manually set your email as admin after running this migration:
-- UPDATE profiles SET plan = 'admin', is_admin = true WHERE email = 'your-email@example.com';
