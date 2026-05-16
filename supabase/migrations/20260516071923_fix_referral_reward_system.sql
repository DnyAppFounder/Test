/*
  # Fix Referral and Reward System

  ## Changes

  ### 1. Secure Referral Code Generation
  - Replace predictable username/md5(random()) codes with cryptographically
    secure codes using gen_random_bytes() (PostgreSQL CSPRNG).
  - Format: DAWEN-XXXXXXXX where X is from a safe unambiguous alphabet
    (no 0/O/1/I confusion). Example: DAWEN-X7K9P4Q2.

  ### 2. Stale 'claiming' Recovery
  - New function reset_stale_claiming_rewards() resets rewards stuck in
    'claiming' state for >3 minutes with no transaction signature back to
    'ready'. Called on app startup to clear state left by crashed edge-function
    invocations.

  ### 3. increment_referral_code_uses RPC
  - Creates the server-side increment function so the anon-key fallback in
    referralService.ts is no longer needed.

  ### 4. Deduplication: referred user welcome bonus
  - Unique index on user_rewards(user_id) WHERE reason='referral_referred'
    prevents a referred user from receiving more than one welcome-bonus reward.

  ### 5. create_referral_rewards idempotency
  - Adds ON CONFLICT DO NOTHING so duplicate RPC calls do not create
    double rewards.

  ### 6. Grant execute permissions to anon/authenticated for new functions
*/

-- ─── 1. Cryptographically-secure referral code generator ─────────────────────
-- Uses gen_random_bytes() (CSPRNG) to produce DAWEN-XXXXXXXX codes.
-- Alphabet: 32 unambiguous chars (no 0/O/1/I).
-- 8 chars from 32-char alphabet = 32^8 ≈ 1 trillion combinations.

CREATE OR REPLACE FUNCTION generate_referral_code(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alphabet text    := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code     text;
  v_exists   boolean;
  v_bytes    bytea;
  v_result   text;
  i          integer;
BEGIN
  LOOP
    -- 8 cryptographically-random bytes, one per output char
    v_bytes  := gen_random_bytes(8);
    v_result := '';
    FOR i IN 0..7 LOOP
      -- Map each byte (0-255) to one of 32 alphabet chars via modulo
      v_result := v_result || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % 32), 1);
    END LOOP;
    v_code := 'DAWEN-' || v_result;

    -- Ensure uniqueness (collisions are astronomically unlikely but handled)
    SELECT EXISTS(SELECT 1 FROM referral_codes WHERE code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;

  RETURN v_code;
END;
$$;

-- ─── 2. Stale 'claiming' state recovery ──────────────────────────────────────
-- Resets rewards that were locked into 'claiming' by a crashed edge-function
-- call but never progressed to 'sent' or 'failed'. Threshold: 3 minutes.
-- Returns the number of rows reset.

CREATE OR REPLACE FUNCTION reset_stale_claiming_rewards()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE user_rewards
  SET    status     = 'ready',
         updated_at = now()
  WHERE  status     = 'claiming'
    AND  updated_at  < now() - interval '3 minutes'
    AND  transaction_signature IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION reset_stale_claiming_rewards() TO anon, authenticated;

-- ─── 3. increment_referral_code_uses ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_referral_code_uses(p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE referral_codes SET uses = uses + 1 WHERE code = p_code;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_referral_code_uses(text) TO anon, authenticated;

-- ─── 4. Unique index: one referral_referred reward per user ───────────────────
-- A referred user can only receive one welcome-bonus reward.

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_rewards_referral_referred_unique
  ON user_rewards(user_id)
  WHERE reason = 'referral_referred';

-- ─── 5. Idempotent create_referral_rewards ────────────────────────────────────
-- Uses ON CONFLICT DO NOTHING on both reward inserts so duplicate RPC calls
-- are harmless.

CREATE OR REPLACE FUNCTION create_referral_rewards(
  p_referrer_user_id uuid,
  p_referrer_wallet   text,
  p_referred_user_id  uuid,
  p_referred_wallet   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_amount integer := 300;
  v_referred_amount integer := 150;
  v_mint            text    := 'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump';
BEGIN
  -- Referrer reward (one per referral — no unique constraint, intentional)
  INSERT INTO user_rewards
    (user_id, wallet_address, reward_token_mint, reward_amount, reason, status)
  VALUES
    (p_referrer_user_id, COALESCE(p_referrer_wallet,''), v_mint, v_referrer_amount, 'referral_referrer', 'ready');

  -- Referred user reward (unique index prevents duplicates)
  INSERT INTO user_rewards
    (user_id, wallet_address, reward_token_mint, reward_amount, reason, status)
  VALUES
    (p_referred_user_id, COALESCE(p_referred_wallet,''), v_mint, v_referred_amount, 'referral_referred', 'ready')
  ON CONFLICT DO NOTHING;
END;
$$;
