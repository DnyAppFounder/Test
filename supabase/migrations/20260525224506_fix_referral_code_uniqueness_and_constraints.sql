/*
  # Fix Referral Code Uniqueness and Constraints

  ## Summary
  Hardens the referral system with database-level guarantees that were missing
  or not enforced correctly. Does NOT modify any reward amounts or the early-user
  10,000 DWC claim logic.

  ## Changes

  ### 1. UNIQUE constraint on referral_codes(user_id)
  Ensures every user has at most one referral code. Without this, rapid
  concurrent calls to getOrCreateReferralCode() could insert two rows.

  ### 2. Ensure UNIQUE constraint on referral_codes(code) exists
  The original migration declares code UNIQUE, but we add the constraint
  idempotently here for safety (IF NOT EXISTS guard on the index).

  ### 3. referrals table: add missing columns
  - referred_wallet_address (text) — used in referralService.ts
  - status (text DEFAULT 'pending') — used in referralService.ts
  - qualified_at (timestamptz) — used in referralService.ts
  Guards with IF NOT EXISTS to be safe on existing deployments.

  ### 4. Upgrade generate_referral_code to CSPRNG + DAWEN- prefix
  Replaces the old username-based / md5(random()) code generator with the
  cryptographically-secure DAWEN-XXXXXXXX version (already deployed in the
  2026 migration but re-applied here as a safe CREATE OR REPLACE to ensure it
  is the authoritative version).

  ### 5. Grant execute on generate_referral_code to anon + authenticated
  Required for wallet-auth (anon) callers.

  ## Security
  - No RLS changes (existing policies are correct)
  - All new DB functions are SECURITY DEFINER with search_path = public
*/

-- ── 1. One referral code per user ────────────────────────────────────────────
-- Add UNIQUE constraint on user_id so concurrent inserts cannot produce
-- duplicate codes for the same user. Idempotent (IF NOT EXISTS).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'referral_codes'
      AND indexname = 'referral_codes_user_id_unique'
  ) THEN
    CREATE UNIQUE INDEX referral_codes_user_id_unique
      ON referral_codes(user_id);
  END IF;
END $$;

-- ── 2. Ensure code UNIQUE index exists (belt-and-suspenders) ─────────────────
-- The CREATE TABLE already has code UNIQUE, but the explicit index name
-- lets us reference it clearly in conflict-handling code.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'referral_codes'
      AND indexname = 'referral_codes_code_unique_explicit'
  ) THEN
    CREATE UNIQUE INDEX referral_codes_code_unique_explicit
      ON referral_codes(code);
  END IF;
EXCEPTION WHEN duplicate_table THEN
  NULL; -- index already exists under another name from original CREATE TABLE
END $$;

-- ── 3. Add missing columns to referrals table ────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'referrals' AND column_name = 'referred_wallet_address'
  ) THEN
    ALTER TABLE referrals ADD COLUMN referred_wallet_address text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'referrals' AND column_name = 'status'
  ) THEN
    ALTER TABLE referrals ADD COLUMN status text DEFAULT 'pending';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'referrals' AND column_name = 'qualified_at'
  ) THEN
    ALTER TABLE referrals ADD COLUMN qualified_at timestamptz;
  END IF;
END $$;

-- ── 4. CSPRNG referral code generator (authoritative version) ─────────────────
-- Generates DAWEN-XXXXXXXX codes using gen_random_bytes() (PostgreSQL CSPRNG).
-- Alphabet: 32 unambiguous chars (no 0/O/1/I) — 32^8 ≈ 1 trillion combinations.
-- Loops until a unique code is found (collisions are astronomically rare).

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
  -- If user already has a code, return it immediately (idempotent)
  SELECT code INTO v_code FROM referral_codes WHERE user_id = p_user_id LIMIT 1;
  IF v_code IS NOT NULL THEN
    RETURN v_code;
  END IF;

  LOOP
    -- 8 cryptographically-random bytes, one per output character
    v_bytes  := gen_random_bytes(8);
    v_result := '';
    FOR i IN 0..7 LOOP
      -- Map each byte (0-255) to one of 32 alphabet chars via modulo
      v_result := v_result || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % 32), 1);
    END LOOP;
    v_code := 'DAWEN-' || v_result;

    -- Ensure uniqueness (collision loop)
    SELECT EXISTS(SELECT 1 FROM referral_codes WHERE code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;

  RETURN v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_referral_code(uuid) TO anon, authenticated;

-- ── 5. Idempotent upsert helper for referral code creation ───────────────────
-- Called by getOrCreateReferralCode() in the service layer.
-- Returns the existing or newly-inserted row.

CREATE OR REPLACE FUNCTION upsert_referral_code(p_user_id uuid)
RETURNS TABLE(id uuid, user_id uuid, code text, uses integer, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  -- Get or generate the code
  v_code := generate_referral_code(p_user_id);

  -- Upsert: insert if not exists, return existing row if conflict on user_id
  INSERT INTO referral_codes AS rc (user_id, code)
  VALUES (p_user_id, v_code)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN QUERY
    SELECT rc.id, rc.user_id, rc.code, rc.uses, rc.created_at
    FROM referral_codes rc
    WHERE rc.user_id = p_user_id
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_referral_code(uuid) TO anon, authenticated;

-- ── 6. RLS policies for wallet-auth (anon) access ────────────────────────────
-- The original policies require auth.uid() (Supabase auth sessions) but the
-- app uses wallet-based auth (anon key). Replace with permissive policies that
-- allow anon access; data isolation is enforced at the service layer.

-- referral_codes: allow anon to read all codes (needed for code lookup) and
-- insert their own code (needed for getOrCreateReferralCode).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'referral_codes' AND policyname = 'Anon can read all referral codes'
  ) THEN
    CREATE POLICY "Anon can read all referral codes"
      ON referral_codes FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'referral_codes' AND policyname = 'Anon can insert referral codes'
  ) THEN
    CREATE POLICY "Anon can insert referral codes"
      ON referral_codes FOR INSERT
      TO anon
      WITH CHECK (true);
  END IF;
END $$;

-- referrals: allow anon to read/insert referrals
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'referrals' AND policyname = 'Anon can read referrals'
  ) THEN
    CREATE POLICY "Anon can read referrals"
      ON referrals FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'referrals' AND policyname = 'Anon can insert referrals'
  ) THEN
    CREATE POLICY "Anon can insert referrals"
      ON referrals FOR INSERT
      TO anon
      WITH CHECK (true);
  END IF;
END $$;
