-- Trades are now rebuilt from the platform's order history (exact fills)
ALTER TABLE trades ADD COLUMN IF NOT EXISTS exit_price NUMERIC;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS fill_count INTEGER;
