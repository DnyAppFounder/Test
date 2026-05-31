/*
  # Fix Signature Wall Reward Conflict Handling

  ## Summary
  Adds a partial unique index on user_rewards for signature_wall reason
  (matching the pattern of other reward unique indexes), then updates the
  create_signature_wall_reward function to use the correct conflict target.

  ## Changes
  - Adds `idx_user_rewards_signature_wall_unique` partial unique index on
    (wallet_address) WHERE reason = 'signature_wall'
  - Replaces create_signature_wall_reward to use proper INSERT with conflict handling
*/

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_rewards_signature_wall_unique
  ON user_rewards (wallet_address)
  WHERE reason = 'signature_wall';

CREATE OR REPLACE FUNCTION create_signature_wall_reward(
  p_wallet_address text,
  p_user_id        uuid
)
RETURNS TABLE (
  id                    uuid,
  user_id               uuid,
  wallet_address        text,
  reward_token_mint     text,
  reward_amount         numeric,
  reason                text,
  status                text,
  transaction_signature text,
  created_at            timestamptz,
  updated_at            timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_signed boolean;
BEGIN
  -- Verify the wallet actually signed the signature wall
  SELECT EXISTS (
    SELECT 1 FROM game_signatures
    WHERE wallet_address = p_wallet_address
    LIMIT 1
  ) INTO v_signed;

  IF NOT v_signed THEN
    RETURN;
  END IF;

  -- Safe insert: ignore if row already exists (partial unique index on wallet_address WHERE reason='signature_wall')
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
    p_user_id,
    p_wallet_address,
    'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump',
    10000,
    'signature_wall',
    'ready',
    now(),
    now()
  )
  ON CONFLICT (wallet_address) WHERE reason = 'signature_wall' DO NOTHING;

  -- Return the row (whether just inserted or already existed)
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
