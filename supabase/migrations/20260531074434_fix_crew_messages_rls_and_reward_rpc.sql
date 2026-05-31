/*
  # Fix crew_application_messages RLS and create_signature_wall_reward RPC

  ## Summary

  ### Issue 1 — crew_application_messages RLS
  All DAWEN crew tables use wallet-based auth (not Supabase email auth).
  `auth.uid()` is always null for all client requests — the app operates
  entirely as the `public` role. The previous policies targeted `authenticated`
  and `anon` roles with `auth.uid()` checks, which never matched.
  Fix: drop all broken policies and add `public` role policies that match
  the existing pattern used by crew_applications, crew_members, etc.

  ### Issue 2 — create_signature_wall_reward RPC blocked by user_rewards RLS
  The `user_rewards` table has INSERT restricted to `service_role` only.
  Even though `create_signature_wall_reward` is SECURITY DEFINER (runs as
  function owner), Supabase's `postgres` role still has RLS enforced unless
  `SET row_security = off` is specified. Fix: replace the function with the
  same body but add `SET row_security = off` so the SECURITY DEFINER context
  bypasses RLS on the INSERT into user_rewards.

  ## Changes
  - Drop all broken crew_application_messages policies
  - Add correct public-role policies for crew_application_messages
  - Replace create_signature_wall_reward with row_security = off version
*/

-- ── ISSUE 1: Fix crew_application_messages RLS ────────────────────────────────

-- Drop all broken policies that used auth.uid() / authenticated role
DROP POLICY IF EXISTS "Crew admins can read application messages" ON crew_application_messages;
DROP POLICY IF EXISTS "Crew admins can insert application messages" ON crew_application_messages;
DROP POLICY IF EXISTS "Applicants can read their own application messages" ON crew_application_messages;
DROP POLICY IF EXISTS "Applicants can reply to application messages" ON crew_application_messages;

-- Add correct public-role policies matching the existing crew table pattern
-- (app uses wallet auth, auth.uid() is always null, security enforced at app layer)

CREATE POLICY "Public can read crew application messages"
  ON crew_application_messages FOR SELECT
  TO public
  USING (is_internal = false);

CREATE POLICY "Public can insert crew application messages"
  ON crew_application_messages FOR INSERT
  TO public
  WITH CHECK (true);

-- ── ISSUE 2: Fix create_signature_wall_reward to bypass RLS ──────────────────

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
  -- Verify the wallet actually signed the signature wall
  SELECT EXISTS (
    SELECT 1 FROM game_signatures
    WHERE wallet_address = p_wallet_address
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

-- Ensure all roles can call it (already set, but make explicit)
GRANT EXECUTE ON FUNCTION create_signature_wall_reward(text, uuid) TO anon, authenticated, service_role;
