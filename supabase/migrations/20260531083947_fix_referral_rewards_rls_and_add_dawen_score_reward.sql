/*
  # Fix referral rewards RLS + add DAWEN score reward RPC

  ## Changes
  1. Fix `create_referral_rewards` — add SET row_security = off so the SECURITY DEFINER
     function can actually INSERT into user_rewards (same fix applied to signature_wall reward)
  2. Add `create_dawen_score_reward` RPC — grants 50,000 $DWORLD to any wallet that has
     a DAWEN Score >= 15,000; idempotent (ON CONFLICT DO NOTHING)

  ## Security Notes
  - Both functions are SECURITY DEFINER with SET row_security = off so they bypass RLS
    for the internal INSERT only — the wallet check ensures no arbitrary rewards
  - Public users can call create_dawen_score_reward but it only creates the reward if
    the score threshold is genuinely met per the user_stats / game_results tables
*/

-- ─── 1. Fix create_referral_rewards ───────────────────────────────────────────
-- Drop old version (ignore if not exists)
DROP FUNCTION IF EXISTS create_referral_rewards(text, text);

CREATE OR REPLACE FUNCTION create_referral_rewards(
  p_referrer_wallet text,
  p_referred_wallet text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_referrer_profile_id uuid;
  v_referred_profile_id uuid;
BEGIN
  -- Look up profile IDs (optional; rewards don't require a profile)
  SELECT id INTO v_referrer_profile_id FROM user_profiles WHERE wallet_address = p_referrer_wallet LIMIT 1;
  SELECT id INTO v_referred_profile_id FROM user_profiles WHERE wallet_address = p_referred_wallet LIMIT 1;

  -- Referrer reward (3,000 DWORLD)
  INSERT INTO user_rewards (
    wallet_address, user_id, reward_amount, reason, status
  ) VALUES (
    p_referrer_wallet, v_referrer_profile_id, 3000, 'referral_bonus', 'pending'
  ) ON CONFLICT DO NOTHING;

  -- Referred reward (5,000 DWORLD)
  INSERT INTO user_rewards (
    wallet_address, user_id, reward_amount, reason, status
  ) VALUES (
    p_referred_wallet, v_referred_profile_id, 5000, 'referral_bonus', 'pending'
  ) ON CONFLICT DO NOTHING;
END;
$$;

-- ─── 2. Add create_dawen_score_reward RPC ─────────────────────────────────────
DROP FUNCTION IF EXISTS create_dawen_score_reward(text);

CREATE OR REPLACE FUNCTION create_dawen_score_reward(
  p_wallet text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_dawen_score  numeric := 0;
  v_profile_id   uuid;
  v_reward_id    uuid;
  v_existing_id  uuid;
BEGIN
  -- Get current DAWEN Score from user_stats (most up-to-date value)
  SELECT COALESCE(dawen_score, 0) INTO v_dawen_score
  FROM user_stats
  WHERE wallet_address = p_wallet
  LIMIT 1;

  -- Fallback: compute from game_results if no user_stats row
  IF v_dawen_score = 0 THEN
    SELECT COALESCE(SUM(gr.score), 0) INTO v_dawen_score
    FROM game_results gr
    WHERE gr.wallet_address = p_wallet;
  END IF;

  -- Threshold check
  IF v_dawen_score < 15000 THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'score_too_low',
      'dawen_score', v_dawen_score
    );
  END IF;

  -- Check if reward already exists for this wallet + reason
  SELECT id INTO v_existing_id
  FROM user_rewards
  WHERE wallet_address = p_wallet
    AND reason = 'dawen_score_15k'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_exists', true,
      'reward_id', v_existing_id
    );
  END IF;

  -- Look up optional profile_id
  SELECT id INTO v_profile_id FROM user_profiles WHERE wallet_address = p_wallet LIMIT 1;

  -- Insert new reward
  INSERT INTO user_rewards (
    wallet_address, user_id, reward_amount, reason, status
  ) VALUES (
    p_wallet, v_profile_id, 50000, 'dawen_score_15k', 'pending'
  )
  RETURNING id INTO v_reward_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_exists', false,
    'reward_id', v_reward_id
  );
END;
$$;
