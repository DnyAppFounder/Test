/*
  # Fix create_signature_wall_reward ambiguous column reference

  ## Summary
  The function had an ambiguous column reference: the PL/pgSQL variable
  `wallet_address` conflicted with the `game_signatures.wallet_address` column.
  Fix: qualify the column name with the table alias `gs.wallet_address`.
*/

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
SET row_security = off
AS $$
DECLARE
  v_signed boolean;
BEGIN
  -- Verify the wallet actually signed the signature wall (use table alias to avoid ambiguity)
  SELECT EXISTS (
    SELECT 1 FROM game_signatures gs
    WHERE gs.wallet_address = p_wallet_address
    LIMIT 1
  ) INTO v_signed;

  IF NOT v_signed THEN
    RETURN;
  END IF;

  -- Safe insert: ignore if row already exists
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

  -- Return the row (use table alias to avoid ambiguity)
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

GRANT EXECUTE ON FUNCTION create_signature_wall_reward(text, uuid) TO anon, authenticated, service_role;
