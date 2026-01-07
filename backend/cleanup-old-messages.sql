-- Cleanup old non-favorited messages to save storage
-- Runs daily, keeps favorited messages forever + last 7 days of regular messages

-- Create cleanup function
CREATE OR REPLACE FUNCTION cleanup_old_messages()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM chat_messages
  WHERE is_favorited = false
    AND created_at < NOW() - INTERVAL '7 days';
  
  -- Log the cleanup
  RAISE NOTICE 'Cleaned up old non-favorited messages';
END;
$$;

-- Schedule daily cleanup at 3 AM UTC using pg_cron
-- (Requires pg_cron extension enabled in Supabase dashboard)
SELECT cron.schedule(
  'cleanup-old-messages',           -- job name
  '0 3 * * *',                      -- cron expression: 3 AM daily
  $$SELECT cleanup_old_messages();$$ -- SQL to run
);

-- Manual cleanup (run once to clear existing old messages)
-- Uncomment and run this separately if you want to clean up now:
-- SELECT cleanup_old_messages();

-- To check what would be deleted (dry run):
-- SELECT COUNT(*) 
-- FROM chat_messages 
-- WHERE is_favorited = false 
--   AND created_at < NOW() - INTERVAL '7 days';

-- To view scheduled jobs:
-- SELECT * FROM cron.job;

-- To unschedule the job (if needed):
-- SELECT cron.unschedule('cleanup-old-messages');
