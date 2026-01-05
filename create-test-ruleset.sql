-- Create a test ruleset for your user
-- Replace 'your-email@example.com' with your actual email

INSERT INTO rulesets (user_id, name, rules_text, rules_json)
SELECT 
  id,
  'My Trading Rules',
  'Wait for confirmation. Only trade with the trend. Risk no more than 1% per trade. Take profit at key levels.',
  '{"rules": ["Wait for confirmation", "Only trade with the trend", "Risk no more than 1% per trade", "Take profit at key levels"]}'::jsonb
FROM profiles
WHERE email = 'your-email@example.com';

-- View your ruleset
SELECT r.id, r.name, r.rules_text, p.email
FROM rulesets r
JOIN profiles p ON r.user_id = p.id
WHERE p.email = 'your-email@example.com';
