/*
  # Fix create_signature_wall_reward — accept nullable user_id + lookup internally

  ## Problem
  The function required p_user_id to be a valid uuid, but the caller
  (ensureReward in signatureWallRewardService.ts) was calling getOrCreateProfile
  which could fail silently and return null, causing the reward creation to abort
  before even reaching the RPC.

  ## Fix
  - Make p_user_id DEFAULT NULL so it's optional
  - If p_user_id is null, look it up from user_profiles internally
  - This removes the caller's dependency on getOrCreateProfile succeeding
  - All existing behaviour (eligibility check, idempotent insert, RETURN QUERY) preserved
*/

CREATE OR REPLACE FUNCTION create_signature_wall_reward(
  p_wallet_address text,
  p_user_id        uuid DEFAULT NULL
)
RETURNS TABLE(
  id                   uuid,
  user_id              uuid,
  wallet_address       text,
  reward_token_mint    text,
  reward_amount        numeric,
  reason               text,
  status               text,
  transaction_signature text,
  created_at           timestamptz,
  updated_at           timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_signed    boolean;
  v_user_id   uuid;
BEGIN
  -- Verify the wallet actually signed the signature wall
  SELECT EXISTS (
    SELECT 1 FROM game_signatures gs
    WHERE gs.wallet_address = p_wallet_address
    LIMIT 1
  ) INTO v_signed;

  IF NOT v_signed THEN
    RETURN; -- empty result set; caller treats this as null
  END IF;

  -- Resolve user_id: use provided value, fall back to lookup
  v_user_id := p_user_id;
  IF v_user_id IS NULL THEN
    SELECT up.id INTO v_user_id
    FROM user_profiles up
    WHERE up.wallet_address = p_wallet_address
    LIMIT 1;
    -- Still NULL if no profile — that's fine, user_id is nullable in user_rewards
  END IF;

  -- Idempotent insert: skip if row already exists
  INSERT INTO user_rewards (
    user_id,
    wallet_address,
    reward_token_mint,
    reward_amount,
    reason,
    status,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    p_wallet_address,
    'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump',
    10000,
    'signature_wall',
    'ready',
    now(),
    now()
  )
  ON CONFLICT (wallet_address) WHERE reason = 'signature_wall' DO NOTHING;

  -- Return the row (existing or just inserted)
  RETURN QUERY
  SELECT
    r.id, r.user_id, r.wallet_address, r.reward_token_mint,
    r.reward_amount, r.reason, r.status::text, r.transaction_signature,
    r.created_at, r.updated_at
  FROM user_rewards r
  WHERE r.wallet_address = p_wallet_address
    AND r.reason = 'signature_wall'
  LIMIT 1;
END;
$$;
