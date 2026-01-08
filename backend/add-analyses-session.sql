-- Add session_id to analyses table to link them to chat sessions
-- This allows analyses to be deleted when users clear their chat history

ALTER TABLE analyses
ADD COLUMN IF NOT EXISTS session_id UUID;

CREATE INDEX IF NOT EXISTS idx_analyses_session_id ON analyses(session_id);

-- Note: When users delete chat_messages for a session, 
-- you should also delete analyses with the same session_id
