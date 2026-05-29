/*
  # Fix check_and_grant_early_user_reward to read limit from reward_settings

  ## Problem
  The DB function `check_and_grant_early_user_reward` had a hardcoded `v_limit := 100`,
  so even after reward_settings.first_100_limit was updated to 10000, only the first
  100 users by profile creation order received the reward row.

  ## Changes
  - Replaces `v_limit integer := 100` with a DB lookup from `reward_settings`
    where key = 'first_100_limit', defaulting to 10000 if the row is missing.
  - No other logic changes.

  ## Security
  - Function remains SECURITY DEFINER, no RLS change needed.
*/

CREATE OR REPLACE FUNCTION check_and_grant_early_user_reward(
  p_user_id       uuid,
  p_wallet_address text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rank   bigint;
  v_limit  integer;
  v_amount integer := 10000;
  v_mint   text;
BEGIN
  -- Read limit from reward_settings, default to 10000
  SELECT COALESCE(value::integer, 10000)
    INTO v_limit
    FROM reward_settings
   WHERE key = 'first_100_limit'
   LIMIT 1;

  IF v_limit IS NULL THEN
    v_limit := 10000;
  END IF;

  -- Read token mint from reward_settings
  SELECT COALESCE(value, 'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump')
    INTO v_mint
    FROM reward_settings
   WHERE key = 'dawenworld_reward_token_mint'
   LIMIT 1;

  IF v_mint IS NULL THEN
    v_mint := 'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump';
  END IF;

  -- Skip if already granted
  IF EXISTS (
    SELECT 1 FROM user_rewards
    WHERE user_id = p_user_id AND reason = 'early_user_first_100'
  ) THEN
    RETURN;
  END IF;

  -- Rank = number of profiles created strictly before this one + 1
  SELECT COUNT(*) + 1 INTO v_rank
  FROM user_profiles
  WHERE created_at < (SELECT created_at FROM user_profiles WHERE id = p_user_id);

  IF v_rank <= v_limit THEN
    INSERT INTO user_rewards (user_id, wallet_address, reward_token_mint, reward_amount, reason, status)
    VALUES (
      p_user_id,
      COALESCE(p_wallet_address, ''),
      v_mint,
      v_amount,
      'early_user_first_100',
      'ready'
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
