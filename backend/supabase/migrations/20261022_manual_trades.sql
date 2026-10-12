-- Trades the trader reports in chat ("I just made 200") and confirms with one tap.
-- They carry only a P&L amount and a time, so the platform fields become optional.
ALTER TABLE trades ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual'));
ALTER TABLE trades ALTER COLUMN symbol DROP NOT NULL;
ALTER TABLE trades ALTER COLUMN side DROP NOT NULL;
ALTER TABLE trades ALTER COLUMN qty DROP NOT NULL;
