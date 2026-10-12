-- A result the trader gave as their total for the day ("up 381 today") is logged as the
-- difference from what is already in the journal. It counts in P&L but is not a trade: it
-- stays out of trade counts, win rate, loss streaks, the max-trades limit and the trading window.
ALTER TABLE trades ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'trade' CHECK (kind IN ('trade', 'day_total'));
