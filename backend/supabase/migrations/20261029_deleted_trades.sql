-- Deleting trades from the journal. Detected trades are read again from the trading platform (its history loads
-- with the page), so a delete is remembered: one row per deleted trade, and a cut-off for "clear all trades".
CREATE TABLE IF NOT EXISTS deleted_trades (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_trade_id TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, client_trade_id)
);
ALTER TABLE deleted_trades ENABLE ROW LEVEL SECURITY;

-- Trades that closed before this time are never imported again (set by "Clear all trades")
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trades_cleared_at TIMESTAMPTZ;
