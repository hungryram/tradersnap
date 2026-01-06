# Chat Storage Migration to Supabase

## What Changed

Chat messages are now stored in Supabase instead of just `chrome.local.storage`. This provides:

1. **Audit Trail** - Compliance with FINRA 2026 requirements for AI chatbot logging
2. **Cross-Device Sync** - Access chat history from any device
3. **Persistence** - Messages survive browser cache clears
4. **Fast Performance** - Still uses chrome.storage as cache for instant load

## Database Migration Required

**Run this SQL in your Supabase SQL Editor:**

```sql
-- Create chat_messages table for storing conversation history
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID, -- Optional: group messages by trading session
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  screenshot_url TEXT, -- Optional: S3/Supabase Storage URL for chart screenshots
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX idx_chat_messages_user_session ON chat_messages(user_id, session_id);

-- Enable Row Level Security
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own messages
CREATE POLICY "Users can view their own messages"
  ON chat_messages
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can only insert their own messages
CREATE POLICY "Users can insert their own messages"
  ON chat_messages
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own messages
CREATE POLICY "Users can delete their own messages"
  ON chat_messages
  FOR DELETE
  USING (auth.uid() = user_id);
```

## How It Works

### Backend
- `/api/chat` - Saves user + AI messages to Supabase after OpenAI response
- `/api/chat/history` - Fetches recent messages (default: 100 max)
- `/api/chat/clear` - Deletes all messages for authenticated user

### Extension
1. **On mount**: Loads cached messages from chrome.storage instantly
2. **Background**: Fetches full history from Supabase API
3. **On new message**: Saves to Supabase via API, updates cache
4. **Clear chat**: Deletes from both Supabase and local storage

## Testing

After running the migration:

1. **Reload extension** in chrome://extensions
2. **Send a chat message** - should save to Supabase
3. **Check Supabase** → Table Editor → chat_messages (you should see the message)
4. **Restart browser** and reopen extension - messages should persist
5. **Clear chat** from menu - should delete from database

## Storage Limits

- **chrome.storage**: Caches last 20 messages (fast local access)
- **Supabase**: Stores up to 100 messages per fetch (configurable)
- **Database**: No hard limit, but queries cap at 500 messages max

## Rollback Plan

If issues arise, the extension still works with just chrome.storage:
- Messages will still send and display
- Just won't persist across devices/sessions
- No compliance audit trail

To rollback code:
```bash
git revert HEAD
pnpm build
```
