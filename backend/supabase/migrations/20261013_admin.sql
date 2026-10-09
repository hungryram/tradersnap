-- Thumbs up/down on analysis verdicts (AI quality tracking in the admin page)
CREATE TABLE IF NOT EXISTS analysis_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating IN (-1, 1)),
  -- Copy of the verdict at rating time, so it can be reviewed even if the chat is cleared
  snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_analysis_ratings_created_at ON analysis_ratings(created_at DESC);
ALTER TABLE analysis_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ratings"
  ON analysis_ratings FOR SELECT USING (auth.uid() = user_id);
