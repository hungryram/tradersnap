-- Usage Events Table (raw activity log)
CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- extension_opened, chart_uploaded, analysis_started, analysis_finished, user_reported_trade_taken
  session_id UUID, -- Optional: links events to chat sessions
  metadata JSONB DEFAULT '{}'::jsonb, -- Flexible data: { "source": "screenshot", "decision": "no_trade", "taken": true }
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_usage_events_user_id ON usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_event_type ON usage_events(event_type);
CREATE INDEX IF NOT EXISTS idx_usage_events_user_created ON usage_events(user_id, created_at DESC);

-- View: Daily usage summary (what you actually look at)
CREATE OR REPLACE VIEW daily_usage_summary AS
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

-- View: Decision outcomes (tells you if it's doing its job)
CREATE OR REPLACE VIEW decision_breakdown AS
SELECT 
  metadata->>'decision' as decision,
  COUNT(*) as count
FROM usage_events
WHERE event_type = 'analysis_finished'
  AND metadata->>'decision' IS NOT NULL
GROUP BY metadata->>'decision'
ORDER BY count DESC;

-- View: User behavior summary (GOLD - who it's actually helping)
CREATE OR REPLACE VIEW user_behavior_summary AS
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
  p.email,
  us.days_active,
  us.charts_uploaded,
  us.no_trade_count,
  us.trades_taken,
  us.last_active,
  -- Behavior flags
  CASE 
    WHEN us.days_active >= 3 AND us.no_trade_count > us.trades_taken THEN 'ideal_user'
    WHEN us.days_active = 1 AND us.charts_uploaded <= 2 THEN 'bounced'
    WHEN us.trades_taken > us.no_trade_count THEN 'overtrader'
    ELSE 'active'
  END as user_type
FROM user_stats us
JOIN profiles p ON us.user_id = p.id
ORDER BY us.last_active DESC;

-- View: Recent activity (for debugging/monitoring)
CREATE OR REPLACE VIEW recent_activity AS
SELECT 
  ue.id,
  p.email,
  ue.event_type,
  ue.metadata,
  ue.created_at
FROM usage_events ue
JOIN profiles p ON ue.user_id = p.id
ORDER BY ue.created_at DESC
LIMIT 100;

-- Function to log events (optional helper, or just INSERT directly)
CREATE OR REPLACE FUNCTION log_usage_event(
  p_user_id UUID,
  p_event_type TEXT,
  p_session_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO usage_events (user_id, event_type, session_id, metadata)
  VALUES (p_user_id, p_event_type, p_session_id, p_metadata)
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
