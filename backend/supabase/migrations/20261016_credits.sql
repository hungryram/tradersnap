-- Usage as one daily allowance of "units" (a message, a chart message and an
-- analysis cost different amounts; see CREDIT_COSTS in lib/usage.ts), plus
-- bought units that are used once the daily allowance runs out and never expire.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credits_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bonus_credits INTEGER NOT NULL DEFAULT 0;

-- One row per Stripe top-up checkout, so a webhook delivered twice can't add units twice
CREATE TABLE IF NOT EXISTS credit_purchases (
  stripe_session_id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  units INTEGER NOT NULL,
  amount_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE credit_purchases ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_credits(
  p_user_id UUID,
  p_units INTEGER,
  p_messages INTEGER,
  p_screenshots INTEGER,
  p_daily_units INTEGER
)
RETURNS TABLE(out_allowed BOOLEAN, out_used INTEGER, out_bonus INTEGER, out_from_bonus INTEGER, out_message_count INTEGER, out_screenshot_count INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  v_used INTEGER;
  v_bonus INTEGER;
  v_messages INTEGER;
  v_screenshots INTEGER;
  v_daily_part INTEGER;
  v_bonus_part INTEGER;
BEGIN
  -- New day (UTC): reset the daily counters
  UPDATE profiles p
  SET message_count = 0, screenshot_count = 0, credits_used = 0, usage_reset_date = CURRENT_DATE
  WHERE p.id = p_user_id
    AND (p.usage_reset_date IS NULL OR p.usage_reset_date < CURRENT_DATE);

  -- Lock the row so parallel requests are counted one after another
  SELECT COALESCE(p.credits_used, 0), COALESCE(p.bonus_credits, 0), COALESCE(p.message_count, 0), COALESCE(p.screenshot_count, 0)
  INTO v_used, v_bonus, v_messages, v_screenshots
  FROM profiles p
  WHERE p.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0, 0, 0;
    RETURN;
  END IF;

  -- Daily allowance first, then bought units
  v_daily_part := LEAST(p_units, GREATEST(p_daily_units - v_used, 0));
  v_bonus_part := p_units - v_daily_part;

  IF v_bonus_part > v_bonus THEN
    RETURN QUERY SELECT FALSE, v_used, v_bonus, 0, v_messages, v_screenshots;
    RETURN;
  END IF;

  UPDATE profiles p
  SET credits_used = v_used + v_daily_part,
      bonus_credits = v_bonus - v_bonus_part,
      message_count = v_messages + p_messages,
      screenshot_count = v_screenshots + p_screenshots
  WHERE p.id = p_user_id;

  RETURN QUERY SELECT TRUE, v_used + v_daily_part, v_bonus - v_bonus_part, v_bonus_part, v_messages + p_messages, v_screenshots + p_screenshots;
END;
$$;

-- Gives back exactly what consume_credits took (daily part and bought part)
CREATE OR REPLACE FUNCTION public.refund_credits(
  p_user_id UUID,
  p_daily_units INTEGER,
  p_bonus_units INTEGER,
  p_messages INTEGER,
  p_screenshots INTEGER
)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE profiles
  SET credits_used = GREATEST(COALESCE(credits_used, 0) - p_daily_units, 0),
      bonus_credits = COALESCE(bonus_credits, 0) + p_bonus_units,
      message_count = GREATEST(COALESCE(message_count, 0) - p_messages, 0),
      screenshot_count = GREATEST(COALESCE(screenshot_count, 0) - p_screenshots, 0)
  WHERE id = p_user_id;
$$;

-- Adds bought units once per Stripe checkout session; returns false if already added
CREATE OR REPLACE FUNCTION public.add_bonus_credits(
  p_user_id UUID,
  p_units INTEGER,
  p_session_id TEXT,
  p_amount_cents INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO credit_purchases (stripe_session_id, user_id, units, amount_cents)
  VALUES (p_session_id, p_user_id, p_units, p_amount_cents)
  ON CONFLICT (stripe_session_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  UPDATE profiles SET bonus_credits = COALESCE(bonus_credits, 0) + p_units WHERE id = p_user_id;
  RETURN TRUE;
END;
$$;

-- Server only
REVOKE EXECUTE ON FUNCTION public.consume_credits(UUID, INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_credits(UUID, INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_bonus_credits(UUID, INTEGER, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credits(UUID, INTEGER, INTEGER, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits(UUID, INTEGER, INTEGER, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_bonus_credits(UUID, INTEGER, TEXT, INTEGER) TO service_role;
