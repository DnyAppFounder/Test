/*
  # Add Tracked Wallets Table

  ## Purpose
  Allows users to save and revisit external Solana wallet addresses they want to monitor
  through the Portfolio Tracker feature.

  ## New Tables
  - `tracked_wallets`
    - `id` (uuid, primary key)
    - `user_id` (text) — the wallet address of the current user (owner)
    - `tracked_address` (text) — the Solana address being tracked
    - `nickname` (text, nullable) — optional friendly label
    - `created_at` (timestamptz) — when the record was added

  ## Security
  - RLS enabled
  - Permissive anon/authenticated policies matching existing wallet-auth pattern
  - Unique constraint on (user_id, tracked_address) to prevent duplicates
*/

CREATE TABLE IF NOT EXISTS tracked_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  tracked_address text NOT NULL,
  nickname text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, tracked_address)
);

ALTER TABLE tracked_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tracked_wallets_select"
  ON tracked_wallets FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "tracked_wallets_insert"
  ON tracked_wallets FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "tracked_wallets_update"
  ON tracked_wallets FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tracked_wallets_delete"
  ON tracked_wallets FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS tracked_wallets_user_id_idx ON tracked_wallets(user_id);
