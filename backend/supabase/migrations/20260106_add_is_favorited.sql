-- Add is_favorited column to chat_messages table
ALTER TABLE chat_messages
ADD COLUMN is_favorited BOOLEAN DEFAULT FALSE NOT NULL;

-- Create index for faster queries on favorited messages
CREATE INDEX idx_chat_messages_favorited ON chat_messages(user_id, is_favorited, created_at DESC)
WHERE is_favorited = true;

-- Add comment
COMMENT ON COLUMN chat_messages.is_favorited IS 'Whether the user has favorited/saved this message for AI memory';
