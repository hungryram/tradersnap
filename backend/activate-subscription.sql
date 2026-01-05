-- Activate subscription for testing
UPDATE profiles 
SET 
  subscription_status = 'active',
  plan = 'pro',
  stripe_customer_id = 'test_customer'
WHERE id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@%' LIMIT 1
);

-- Verify the update
SELECT id, email, subscription_status, plan FROM profiles 
JOIN auth.users ON profiles.id = auth.users.id;
