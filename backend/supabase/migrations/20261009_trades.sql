-- Trades detected automatically by the extension from the trading platform's page
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Built by the extension from the account's state; the same close seen in two tabs gets the same id
  client_trade_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  account TEXT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  qty NUMERIC NOT NULL,
  entry_price NUMERIC,
  realized_pnl NUMERIC,
  -- 'realized': from the platform's Realized PnL; 'estimated': last unrealized PnL before the close
  pnl_source TEXT NOT NULL DEFAULT 'realized' CHECK (pnl_source IN ('realized', 'estimated')),
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, client_trade_id)
);

CREATE INDEX idx_trades_user_closed_at ON trades(user_id, closed_at DESC);

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trades"
  ON trades
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trades"
  ON trades
  FOR DELETE
  USING (auth.uid() = user_id);
