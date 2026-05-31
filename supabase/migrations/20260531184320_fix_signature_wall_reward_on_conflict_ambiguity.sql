/*
  # Fix create_signature_wall_reward ON CONFLICT ambiguity

  ## Problem
  `ON CONFLICT (wallet_address) WHERE reason = 'signature_wall'` errors with:
    "column reference wallet_address is ambiguous"
  because RETURNS TABLE declares an output column also named wallet_address,
  which PL/pgSQL treats as a local variable — conflicting with the target table column
  in the ON CONFLICT clause.

  ## Fix
  Replace `ON CONFLICT (wallet_address) WHERE ...` with `ON CONFLICT DO NOTHING`.
  Safe: the only relevant unique index on user_rewards is
  `idx_user_rewards_signature_wall_unique` (wallet_address WHERE reason='signature_wall'),
  so DO NOTHING correctly handles the existing-row case without specifying the column.

  ## No schema changes — function body fix only.
*/

CREATE OR REPLACE FUNCTION create_signature_wall_reward(
  p_wallet_address text,
  p_user_id        uuid DEFAULT NULL
)
RETURNS TABLE(
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
  v_signed  boolean;
  v_user_id uuid;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM game_signatures gs WHERE gs.wallet_address = p_wallet_address LIMIT 1
  ) INTO v_signed;

  IF NOT v_signed THEN
    RETURN;
  END IF;

  v_user_id := p_user_id;
  IF v_user_id IS NULL THEN
    SELECT up.id INTO v_user_id
    FROM user_profiles up
    WHERE up.wallet_address = p_wallet_address
    LIMIT 1;
  END IF;

  INSERT INTO user_rewards (
    user_id, wallet_address, reward_token_mint,
    reward_amount, reason, status, created_at, updated_at
  )
  VALUES (
    v_user_id, p_wallet_address, 'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump',
    10000, 'signature_wall', 'ready', now(), now()
  )
  ON CONFLICT DO NOTHING;

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
