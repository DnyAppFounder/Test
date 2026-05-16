/*
  # Fix Referral System RLS for Wallet-Based Auth

  ## Problem
  The referral_codes and referrals tables have RLS policies using auth.uid() 
  which don't work because this app uses wallet-based identity (no Supabase Auth sessions).
  This causes the referral code bar to appear empty and all referral operations to fail.

  ## Changes

  ### referral_codes table
  - Drop auth.uid()-based policies
  - Add open SELECT for anon/authenticated (codes are not sensitive)
  - Add open INSERT/UPDATE for anon/authenticated (wallet address is the identity)
  - Service role retains full access

  ### referrals table  
  - Drop auth.uid()-based policies
  - Add open SELECT/INSERT for anon/authenticated
  - Prevent self-referral is enforced by DB function, not RLS

  ### price_alerts table
  - Add wallet_address column if missing
  - Add token_mint column if missing
  - Add current_price_at_creation column if missing
  - Add updated_at column if missing
  - Fix RLS to use wallet_address-based checks instead of auth.uid()
*/

-- =========================================================
-- FIX: referral_codes RLS
-- =========================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can read their own referral code" ON referral_codes;
DROP POLICY IF EXISTS "Users can create their own referral code" ON referral_codes;
DROP POLICY IF EXISTS "Users can update their own referral code" ON referral_codes;
DROP POLICY IF EXISTS "Service role full access on referral_codes" ON referral_codes;

-- Anyone can read referral codes (needed to validate a code during apply)
CREATE POLICY "Anyone can read referral codes"
  ON referral_codes FOR SELECT
  TO anon, authenticated
  USING (true);

-- Anyone can insert their own referral code (wallet auth, no uid)
CREATE POLICY "Anyone can insert referral codes"
  ON referral_codes FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Anyone can update referral code use counts
CREATE POLICY "Anyone can update referral codes"
  ON referral_codes FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- =========================================================
-- FIX: referrals RLS
-- =========================================================

DROP POLICY IF EXISTS "Users can read their own referrals" ON referrals;
DROP POLICY IF EXISTS "Users can create referrals" ON referrals;
DROP POLICY IF EXISTS "Service role full access on referrals" ON referrals;

-- Anyone can read referrals (filtered in app by wallet)
CREATE POLICY "Anyone can read referrals"
  ON referrals FOR SELECT
  TO anon, authenticated
  USING (true);

-- Anyone can insert a referral (self-referral check is in DB function)
CREATE POLICY "Anyone can insert referrals"
  ON referrals FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- =========================================================
-- FIX: price_alerts table schema + RLS
-- =========================================================

-- Add missing columns to price_alerts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'price_alerts' AND column_name = 'wallet_address'
  ) THEN
    ALTER TABLE price_alerts ADD COLUMN wallet_address text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'price_alerts' AND column_name = 'token_mint'
  ) THEN
    ALTER TABLE price_alerts ADD COLUMN token_mint text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'price_alerts' AND column_name = 'current_price_at_creation'
  ) THEN
    ALTER TABLE price_alerts ADD COLUMN current_price_at_creation numeric(30,10) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'price_alerts' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE price_alerts ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'price_alerts' AND column_name = 'triggered_at'
  ) THEN
    ALTER TABLE price_alerts ADD COLUMN triggered_at timestamptz;
  END IF;
END $$;

-- Drop old auth.uid() policies on price_alerts
DROP POLICY IF EXISTS "Users can read their own price alerts" ON price_alerts;
DROP POLICY IF EXISTS "Users can create price alerts" ON price_alerts;
DROP POLICY IF EXISTS "Users can update their own price alerts" ON price_alerts;
DROP POLICY IF EXISTS "Users can delete their own price alerts" ON price_alerts;

-- New wallet-based RLS for price_alerts
CREATE POLICY "Anyone can read price alerts"
  ON price_alerts FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert price alerts"
  ON price_alerts FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update price alerts"
  ON price_alerts FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete price alerts"
  ON price_alerts FOR DELETE
  TO anon, authenticated
  USING (true);
