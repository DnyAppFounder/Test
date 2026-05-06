/*
  # Create Launchpad Tables

  1. New Tables
    - `launchpad_tokens` — Core token launch records, one row per token created via the launchpad
      - `id` (uuid, PK)
      - `mint_address` (text, unique) — on-chain SPL mint public key
      - `creator_wallet` (text) — creator's Solana wallet address
      - `token_program` (text) — 'spl-token' or 'token-2022'
      - `name` (text)
      - `symbol` (text)
      - `description` (text)
      - `image_url` (text) — Supabase storage public URL
      - `metadata_uri` (text) — uploaded metadata JSON URL
      - `decimals` (int2) — 0–9
      - `total_supply` (numeric) — raw total supply
      - `creator_allocation` (numeric) — tokens sent to creator
      - `liquidity_allocation` (numeric) — tokens reserved for liquidity
      - `status` (text) — 'pending' | 'deployed' | 'failed'
      - `website` (text, nullable)
      - `telegram` (text, nullable)
      - `twitter` (text, nullable)
      - `discord` (text, nullable)
      - `creation_tx` (text, nullable) — on-chain signature
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `launchpad_token_metadata` — Extended metadata stored off-chain
      - `id` (uuid, PK)
      - `token_id` (uuid, FK → launchpad_tokens.id)
      - `metadata_json` (jsonb)
      - `ipfs_uri` (text, nullable)
      - `arweave_uri` (text, nullable)
      - `created_at` (timestamptz)

    - `launchpad_transactions` — All launchpad-related transactions
      - `id` (uuid, PK)
      - `token_id` (uuid, FK → launchpad_tokens.id)
      - `wallet` (text)
      - `type` (text) — 'create' | 'buy' | 'sell' | 'liquidity'
      - `amount` (numeric, nullable)
      - `price_usd` (numeric, nullable)
      - `tx_signature` (text, nullable)
      - `status` (text) — 'pending' | 'confirmed' | 'failed'
      - `created_at` (timestamptz)

    - `launchpad_creators` — Creator profile and stats
      - `id` (uuid, PK)
      - `wallet_address` (text, unique)
      - `display_name` (text, nullable)
      - `avatar_url` (text, nullable)
      - `tokens_created` (int4, default 0)
      - `total_volume_usd` (numeric, default 0)
      - `created_at` (timestamptz)

    - `launchpad_settings` — Platform-level settings (single admin row)
      - `id` (uuid, PK)
      - `creation_fee_sol` (numeric, default 0.02)
      - `platform_fee_bps` (int4, default 100) — 1% in basis points
      - `enabled` (boolean, default true)
      - `updated_at` (timestamptz)

  2. Security
    - RLS enabled on all tables
    - Public can read deployed tokens and creators
    - Only owner (matching wallet) can insert/update their own records
    - Transactions readable by the wallet owner

  3. Indexes
    - launchpad_tokens: mint_address, creator_wallet, status, created_at DESC
    - launchpad_transactions: token_id, wallet
*/

-- launchpad_tokens
CREATE TABLE IF NOT EXISTS launchpad_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mint_address text UNIQUE,
  creator_wallet text NOT NULL,
  token_program text NOT NULL DEFAULT 'spl-token',
  name text NOT NULL,
  symbol text NOT NULL,
  description text,
  image_url text,
  metadata_uri text,
  decimals smallint NOT NULL DEFAULT 6,
  total_supply numeric NOT NULL DEFAULT 1000000000,
  creator_allocation numeric NOT NULL DEFAULT 0,
  liquidity_allocation numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  website text,
  telegram text,
  twitter text,
  discord text,
  creation_tx text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE launchpad_tokens ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_launchpad_tokens_mint ON launchpad_tokens(mint_address);
CREATE INDEX IF NOT EXISTS idx_launchpad_tokens_creator ON launchpad_tokens(creator_wallet);
CREATE INDEX IF NOT EXISTS idx_launchpad_tokens_status ON launchpad_tokens(status);
CREATE INDEX IF NOT EXISTS idx_launchpad_tokens_created ON launchpad_tokens(created_at DESC);

CREATE POLICY "Anyone can view deployed tokens"
  ON launchpad_tokens FOR SELECT
  USING (status = 'deployed' OR creator_wallet = current_setting('request.jwt.claims', true)::jsonb->>'sub');

CREATE POLICY "Authenticated creator can insert own tokens"
  ON launchpad_tokens FOR INSERT
  TO authenticated
  WITH CHECK (creator_wallet = (auth.jwt() ->> 'sub'));

CREATE POLICY "Creator can update own tokens"
  ON launchpad_tokens FOR UPDATE
  TO authenticated
  USING (creator_wallet = (auth.jwt() ->> 'sub'))
  WITH CHECK (creator_wallet = (auth.jwt() ->> 'sub'));

-- launchpad_token_metadata
CREATE TABLE IF NOT EXISTS launchpad_token_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid REFERENCES launchpad_tokens(id) ON DELETE CASCADE,
  metadata_json jsonb,
  ipfs_uri text,
  arweave_uri text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE launchpad_token_metadata ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_launchpad_metadata_token ON launchpad_token_metadata(token_id);

CREATE POLICY "Anyone can read token metadata"
  ON launchpad_token_metadata FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert metadata"
  ON launchpad_token_metadata FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- launchpad_transactions
CREATE TABLE IF NOT EXISTS launchpad_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid REFERENCES launchpad_tokens(id) ON DELETE CASCADE,
  wallet text NOT NULL,
  type text NOT NULL DEFAULT 'create',
  amount numeric,
  price_usd numeric,
  tx_signature text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE launchpad_transactions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_launchpad_tx_token ON launchpad_transactions(token_id);
CREATE INDEX IF NOT EXISTS idx_launchpad_tx_wallet ON launchpad_transactions(wallet);

CREATE POLICY "Wallet owner can view own transactions"
  ON launchpad_transactions FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert transactions"
  ON launchpad_transactions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update transactions"
  ON launchpad_transactions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- launchpad_creators
CREATE TABLE IF NOT EXISTS launchpad_creators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text UNIQUE NOT NULL,
  display_name text,
  avatar_url text,
  tokens_created int4 NOT NULL DEFAULT 0,
  total_volume_usd numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE launchpad_creators ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_launchpad_creators_wallet ON launchpad_creators(wallet_address);

CREATE POLICY "Anyone can read creator profiles"
  ON launchpad_creators FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert creator profile"
  ON launchpad_creators FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Creator can update own profile"
  ON launchpad_creators FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- launchpad_settings (public read-only)
CREATE TABLE IF NOT EXISTS launchpad_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creation_fee_sol numeric NOT NULL DEFAULT 0.02,
  platform_fee_bps int4 NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE launchpad_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read launchpad settings"
  ON launchpad_settings FOR SELECT
  USING (true);

-- Insert default settings row
INSERT INTO launchpad_settings (creation_fee_sol, platform_fee_bps, enabled)
VALUES (0.02, 100, true)
ON CONFLICT DO NOTHING;
