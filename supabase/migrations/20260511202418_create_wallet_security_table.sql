/*
  # Create wallet_security table

  ## Purpose
  Provides durable server-side storage for PIN hashes keyed by wallet address,
  so users never lose their PIN when browser localStorage is cleared.

  ## New Tables
  - `wallet_security`
    - `wallet_address` (text, not null) — normalized lowercase Solana address
    - `user_id` (uuid, references auth.users) — Supabase auth user, nullable for anonymous
    - `pin_hash` (text, not null) — bcrypt/sha256 hash of the PIN, never plaintext
    - `onboarding_complete` (boolean) — whether full onboarding flow was completed
    - `biometric_enabled` (boolean) — whether biometric unlock is active
    - `created_at` / `updated_at` — timestamps

  ## Primary Key
  Composite: (wallet_address, user_id) when user_id is present.
  For wallets without a Supabase user, wallet_address alone is the lookup key.

  ## Security
  - RLS enabled — authenticated users can only read/write their own records
  - pin_hash is a one-way hash — even if table is read, PINs cannot be reversed
  - No plaintext PINs ever stored

  ## Notes
  - Use UPSERT (ON CONFLICT wallet_address) to prevent duplicates
  - Wallet address is always stored lowercase (normalized)
*/

CREATE TABLE IF NOT EXISTS wallet_security (
  wallet_address  text        NOT NULL,
  user_id         uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash        text        NOT NULL,
  onboarding_complete boolean DEFAULT false,
  biometric_enabled   boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  PRIMARY KEY (wallet_address)
);

ALTER TABLE wallet_security ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own wallet security record
CREATE POLICY "Authenticated users can read own wallet security"
  ON wallet_security FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Authenticated users can insert their own wallet security record
CREATE POLICY "Authenticated users can insert own wallet security"
  ON wallet_security FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Authenticated users can update their own wallet security record
CREATE POLICY "Authenticated users can update own wallet security"
  ON wallet_security FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast lookup by wallet_address
CREATE INDEX IF NOT EXISTS idx_wallet_security_user_id
  ON wallet_security(user_id);
