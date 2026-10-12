-- "Review this day": Pip's read of one trading day in the journal (the day's trades plus the trader's note).
-- The latest review of each day is kept, so reopening the day shows it without another AI call.
CREATE TABLE day_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The trader's local calendar day, YYYY-MM-DD
  day TEXT NOT NULL,
  review JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, day)
);

ALTER TABLE day_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own day reviews"
  ON day_reviews
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own day reviews"
  ON day_reviews
  FOR DELETE
  USING (auth.uid() = user_id);

-- Day reviews get their own cost line
ALTER TABLE llm_usage DROP CONSTRAINT IF EXISTS llm_usage_feature_check;
ALTER TABLE llm_usage ADD CONSTRAINT llm_usage_feature_check CHECK (feature IN ('chat', 'analysis', 'notes', 'checkin', 'rules', 'review'));
