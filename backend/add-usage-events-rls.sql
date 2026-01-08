-- Enable Row Level Security on usage_events (safe if already enabled)
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can insert their own events" ON usage_events;
DROP POLICY IF EXISTS "Service role only can read events" ON usage_events;
DROP POLICY IF EXISTS "No direct user access to events" ON usage_events;

-- Policy: Users can only insert their own events (via API with service role)
CREATE POLICY "Users can insert their own events"
  ON usage_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Block direct SELECT access from regular users
CREATE POLICY "Service role only can read events"
  ON usage_events
  FOR SELECT
  TO authenticated
  USING (false);

-- Drop existing views and recreate with RLS
DROP VIEW IF EXISTS daily_usage_summary CASCADE;
DROP VIEW IF EXISTS decision_breakdown CASCADE;
DROP VIEW IF EXISTS user_behavior_summary CASCADE;
DROP VIEW IF EXISTS recent_activity CASCADE;

-- Recreate views with RLS enabled (will inherit from usage_events table)
CREATE VIEW daily_usage_summary WITH (security_barrier = true) AS
SELECT 
  DATE(created_at) as day,
  COUNT(DISTINCT CASE WHEN event_type = 'extension_opened' THEN user_id END) as users_opened,
  COUNT(DISTINCT CASE WHEN event_type = 'chart_uploaded' THEN user_id END) as users_uploaded,
  COUNT(DISTINCT CASE WHEN event_type = 'analysis_finished' THEN user_id END) as users_analyzed,
  COUNT(DISTINCT CASE 
    WHEN event_type = 'extension_opened' 
    AND DATE(created_at) > (
      SELECT MIN(DATE(created_at)) 
      FROM usage_events e2 
      WHERE e2.user_id = usage_events.user_id
    )
    THEN user_id 
  END) as users_returned
FROM usage_events
GROUP BY DATE(created_at)
ORDER BY day DESC;

CREATE VIEW decision_breakdown WITH (security_barrier = true) AS
SELECT 
  metadata->>'decision' as decision,
  COUNT(*) as count
FROM usage_events
WHERE event_type = 'analysis_finished'
  AND metadata->>'decision' IS NOT NULL
GROUP BY metadata->>'decision'
ORDER BY count DESC;

CREATE VIEW user_behavior_summary WITH (security_barrier = true) AS
WITH user_stats AS (
  SELECT 
    user_id,
    COUNT(DISTINCT DATE(created_at)) as days_active,
    COUNT(CASE WHEN event_type = 'chart_uploaded' THEN 1 END) as charts_uploaded,
    COUNT(CASE WHEN event_type = 'analysis_finished' AND metadata->>'decision' = 'no_trade' THEN 1 END) as no_trade_count,
    COUNT(CASE WHEN event_type = 'user_reported_trade_taken' AND (metadata->>'taken')::boolean = true THEN 1 END) as trades_taken,
    MAX(created_at) as last_active
  FROM usage_events
  GROUP BY user_id
)
SELECT 
  us.user_id,
  us.days_active,
  us.charts_uploaded,
  us.no_trade_count,
  us.trades_taken,
  us.last_active,
  CASE 
    WHEN us.days_active >= 3 AND us.no_trade_count > us.trades_taken THEN 'ideal_user'
    WHEN us.days_active = 1 AND us.charts_uploaded <= 2 THEN 'bounced'
    WHEN us.trades_taken > us.no_trade_count THEN 'overtrader'
    ELSE 'active'
  END as user_type
FROM user_stats us
ORDER BY us.last_active DESC;

CREATE VIEW recent_activity WITH (security_barrier = true) AS
SELECT 
  ue.id,
  ue.event_type,
  ue.metadata,
  ue.created_at
FROM usage_events ue
ORDER BY ue.created_at DESC
LIMIT 100;

-- Enable RLS on all views (makes Supabase UI show them as secured)
ALTER VIEW daily_usage_summary SET (security_barrier = on);
ALTER VIEW decision_breakdown SET (security_barrier = on);
ALTER VIEW user_behavior_summary SET (security_barrier = on);
ALTER VIEW recent_activity SET (security_barrier = on);

-- Revoke all default permissions
REVOKE ALL ON daily_usage_summary FROM PUBLIC, anon, authenticated;
REVOKE ALL ON decision_breakdown FROM PUBLIC, anon, authenticated;
REVOKE ALL ON user_behavior_summary FROM PUBLIC, anon, authenticated;
REVOKE ALL ON recent_activity FROM PUBLIC, anon, authenticated;

-- Grant SELECT only to service_role (backend API)
GRANT SELECT ON daily_usage_summary TO service_role;
GRANT SELECT ON decision_breakdown TO service_role;
GRANT SELECT ON user_behavior_summary TO service_role;
GRANT SELECT ON recent_activity TO service_role;

-- Now these views are admin-only and UI will show them as secured
