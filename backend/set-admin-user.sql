-- Script to set a specific user as admin
-- Replace 'your-email@example.com' with your actual email address

-- Update the user to admin tier
UPDATE profiles 
SET plan = 'admin', 
    is_admin = true,
    subscription_status = 'active'
WHERE email = 'your-email@example.com';

-- Verify the update
SELECT id, email, plan, is_admin, subscription_status
FROM profiles
WHERE email = 'your-email@example.com';

-- Expected result:
-- You should see:
-- - plan: 'admin'
-- - is_admin: true
-- - subscription_status: 'active'
