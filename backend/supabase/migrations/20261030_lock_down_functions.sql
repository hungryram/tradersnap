-- Security: database functions that signed-in users could call directly through the public API.
-- These were created by older setup scripts (outside migrations) and kept Postgres' default "anyone can execute".
-- log_usage_event and increment_usage run with full rights and take any user id, so a user could write rows for
-- other accounts. cleanup_old_messages and reset_daily_usage are scheduled maintenance jobs. Only the server
-- (service role) and the database's own scheduler need any of them.
DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('log_usage_event', 'increment_usage', 'cleanup_old_messages', 'reset_daily_usage', 'get_usage_limits', 'is_user_admin')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- Any new function must do the same: REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated; GRANT ... TO service_role.
