-- Atomic daily usage check + increment.
-- Replaces the read-then-write counters in /api/chat and /api/analyze, which let
-- parallel requests all pass the limit check.

CREATE OR REPLACE FUNCTION public.consume_usage(
  p_user_id UUID,
  p_messages INTEGER,
  p_screenshots INTEGER,
  p_max_messages INTEGER,
  p_max_screenshots INTEGER
)
RETURNS TABLE(out_allowed BOOLEAN, out_message_count INTEGER, out_screenshot_count INTEGER)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Reset the daily window (UTC) if it has passed
  UPDATE profiles p
  SET message_count = 0, screenshot_count = 0, usage_reset_date = CURRENT_DATE
  WHERE p.id = p_user_id
    AND (p.usage_reset_date IS NULL OR p.usage_reset_date < CURRENT_DATE);

  -- Check and increment in one statement (row lock serializes concurrent requests)
  UPDATE profiles p
  SET message_count = COALESCE(p.message_count, 0) + p_messages,
      screenshot_count = COALESCE(p.screenshot_count, 0) + p_screenshots
  WHERE p.id = p_user_id
    AND (p_messages = 0 OR COALESCE(p.message_count, 0) + p_messages <= p_max_messages)
    AND (p_screenshots = 0 OR COALESCE(p.screenshot_count, 0) + p_screenshots <= p_max_screenshots)
  RETURNING TRUE, p.message_count, p.screenshot_count
  INTO out_allowed, out_message_count, out_screenshot_count;

  IF NOT FOUND THEN
    SELECT FALSE, COALESCE(p.message_count, 0), COALESCE(p.screenshot_count, 0)
    INTO out_allowed, out_message_count, out_screenshot_count
    FROM profiles p
    WHERE p.id = p_user_id;
  END IF;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_usage(
  p_user_id UUID,
  p_messages INTEGER,
  p_screenshots INTEGER
)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE profiles
  SET message_count = GREATEST(COALESCE(message_count, 0) - p_messages, 0),
      screenshot_count = GREATEST(COALESCE(screenshot_count, 0) - p_screenshots, 0)
  WHERE id = p_user_id;
$$;

-- Server-only: users must not be able to call these through the public RPC endpoint
-- (refund_usage would let anyone reset their own quota).
REVOKE EXECUTE ON FUNCTION public.consume_usage(UUID, INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_usage(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_usage(UUID, INTEGER, INTEGER, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_usage(UUID, INTEGER, INTEGER) TO service_role;
