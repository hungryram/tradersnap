-- Multiple strategies: rulesets can be active at the same time (Pip checks a chart
-- against all active ones and says which fits), rules that apply to every trade
-- live on the profile, and trades and chart checks remember their strategy.

-- Active strategies (existing users: their primary ruleset becomes their active strategy)
ALTER TABLE rulesets ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE rulesets SET is_active = TRUE WHERE is_primary = TRUE AND is_active = FALSE;

-- Rules for every trade, whatever the setup ("never move my stop")
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS always_rules TEXT;

-- Which strategy a chart check matched (null: matched none)
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS strategy_id UUID REFERENCES rulesets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_analyses_user_created ON analyses(user_id, created_at DESC);

-- Which strategy a trade was: tagged automatically from the chart check before it, or by the trader
ALTER TABLE trades ADD COLUMN IF NOT EXISTS strategy_id UUID REFERENCES rulesets(id) ON DELETE SET NULL;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS strategy_source TEXT CHECK (strategy_source IN ('auto', 'user'));
