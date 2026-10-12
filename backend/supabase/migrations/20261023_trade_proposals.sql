-- The "log this result?" offer Pip makes under a chat reply, kept with the message so it
-- survives reloads and shows in every tab. { id, amount, symbol, status } where status is
-- pending | logged | duplicate | dismissed.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS trade_proposal JSONB;
