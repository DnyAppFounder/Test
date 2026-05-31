/*
  # Add Signature Wall Reward Support

  ## Summary
  Ensures the user_rewards table can store signature_wall rewards without duplicate
  claims. The unique constraint on (wallet_address, reason) already exists from a
  prior migration, so this only adds the helper SQL function for safe upsert.

  ## New Functions
  - `create_signature_wall_reward(p_wallet_address, p_user_id)` — inserts a
    'ready' reward row for the signature wall if one does not already exist.
    Returns the existing row if already present (idempotent).

  ## Security
  - SECURITY DEFINER so the anon role can trigger reward creation
  - Checks game_signatures table to confirm the wallet actually signed before
    creating a reward (prevents reward farming without signing)
*/

CREATE OR REPLACE FUNCTION create_signature_wall_reward(
  p_wallet_address text,
  p_user_id        uuid
)
RETURNS TABLE (
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
    RETURN; -- return empty — reward not granted if not signed
  END IF;

  -- Upsert reward row (unique on wallet_address, reason)
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
  ON CONFLICT (wallet_address, reason) DO NOTHING;

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
