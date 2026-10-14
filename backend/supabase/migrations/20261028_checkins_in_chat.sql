-- Pip's check-ins and "position opened" notices are saved with the chat, so they show on every device,
-- survive a reload, and Pip can see what he already told the trader.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS kind TEXT CHECK (kind IN ('checkin', 'event'));
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS meta JSONB;
-- Set by the extension so the same check-in from two tabs is saved once
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS client_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_user_client_key ON chat_messages(user_id, client_key);
CREATE INDEX IF NOT EXISTS chat_messages_user_kind_created ON chat_messages(user_id, kind, created_at DESC);
