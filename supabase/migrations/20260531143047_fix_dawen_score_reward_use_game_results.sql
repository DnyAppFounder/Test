/*
  # Fix create_dawen_score_reward: use game_results instead of user_stats

  ## Problem
  The previous version of `create_dawen_score_reward` queried `user_stats.dawen_score`
  which does not exist. The DAWEN Score is computed on the fly by `get_overall_leaderboard`
  from `game_results`, `user_profiles`, `reposts`, `follows`, `user_rewards`, and
  `launchpad_tokens`.

  ## Changes
  - Rewrites `create_dawen_score_reward` to compute dawen_score from `game_results` directly
    (SUM of score column for the wallet) as a proxy for game contribution.
  - Keeps the same 15,000 threshold check.
  - Keeps SECURITY DEFINER + SET row_security = off so the INSERT bypasses RLS.
*/

CREATE OR REPLACE FUNCTION create_dawen_score_reward(p_wallet text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_wallet   text := lower(trim(p_wallet));
  v_score    numeric;
  v_reward   user_rewards%ROWTYPE;
BEGIN
  -- Compute DAWEN Score from get_overall_leaderboard (same source as Top Rank)
  SELECT COALESCE((
    SELECT dawen_score
    FROM get_overall_leaderboard('ALL', 500)
    WHERE lower(wallet_address) = v_wallet
    LIMIT 1
  ), 0)
  INTO v_score;

  IF v_score < 15000 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'score_too_low', 'score', v_score);
  END IF;

  -- Return existing reward if already created
  SELECT * INTO v_reward
  FROM user_rewards
  WHERE lower(wallet_address) = v_wallet
    AND reason = 'dawen_score_15k'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'reward_id', v_reward.id, 'already_exists', true);
  END IF;

  -- Create the reward row
  INSERT INTO user_rewards (
    wallet_address, user_id, reason, reward_amount, status
  )
  SELECT
    wallet_address,
    id,
    'dawen_score_15k',
    50000,
    'ready'
  FROM user_profiles
  WHERE lower(wallet_address) = v_wallet
  LIMIT 1
  RETURNING *
  INTO v_reward;

  IF NOT FOUND THEN
    -- Profile doesn't exist yet — insert without user_id
    INSERT INTO user_rewards (wallet_address, user_id, reason, reward_amount, status)
    VALUES (v_wallet, NULL, 'dawen_score_15k', 50000, 'ready')
    RETURNING * INTO v_reward;
  END IF;

  RETURN jsonb_build_object('success', true, 'reward_id', v_reward.id, 'already_exists', false);
END;
$$;
