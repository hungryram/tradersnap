-- Pip's notes: short, durable facts Pip learns about a trader (automatic, once a
-- day at most) or the trader writes themselves. Shown and editable in the
-- dashboard under Memory; deleted with the account.
CREATE TABLE IF NOT EXISTS pip_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 200),
  source TEXT NOT NULL DEFAULT 'pip' CHECK (source IN ('pip', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pip_notes_user ON pip_notes(user_id);
ALTER TABLE pip_notes ENABLE ROW LEVEL SECURITY;

-- Traders can turn memory off; notes_refreshed_at limits the automatic update to once a day
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS memory_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notes_refreshed_at TIMESTAMPTZ;

-- Token usage per AI request, to see what Pip actually costs. No message content.
-- user_id is cleared (not deleted) when an account is deleted, so totals stay right.
CREATE TABLE IF NOT EXISTS llm_usage (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  feature TEXT NOT NULL CHECK (feature IN ('chat', 'analysis', 'notes')),
  model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,       -- uncached input
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,      -- includes thinking
  cost_usd NUMERIC(10, 6),                       -- estimate from list prices; null for unknown models
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_llm_usage_created ON llm_usage(created_at DESC);
ALTER TABLE llm_usage ENABLE ROW LEVEL SECURITY;
