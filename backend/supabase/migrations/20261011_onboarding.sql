-- Onboarding answers and the trader's own limits (used for guardrails and coaching)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trading_profile JSONB; -- { markets: [], platforms: [], prop_firm: bool, experience }
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trading_limits JSONB;  -- { max_trades_per_day, max_daily_loss, stop_after_losses, session_start, session_end, timezone }

-- Anonymous "why did you uninstall?" answers (written by the server only)
CREATE TABLE IF NOT EXISTS uninstall_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reason TEXT NOT NULL,
  details TEXT,
  extension_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE uninstall_feedback ENABLE ROW LEVEL SECURITY;
