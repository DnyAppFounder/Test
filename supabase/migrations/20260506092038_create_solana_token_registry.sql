/*
  # Solana Token Registry

  ## Purpose
  A flat, mint-address-keyed table that stores every discovered Solana token.
  This is the global source of truth for token existence, metadata, and market data.
  It is separate from the existing `tokens` table (which is blockchain-agnostic and
  tied to UUIDs/foreign keys for other features) to allow fast, mint-keyed lookups
  without joins.

  ## New Table: `solana_token_registry`
  - `mint`           (text, primary key) — Solana mint address
  - `symbol`         (text)
  - `name`           (text)
  - `decimals`       (int)
  - `logo_uri`       (text, nullable)
  - `metadata_uri`   (text, nullable) — IPFS/Arweave/HTTPS metadata URI
  - `token_program`  (text) — 'spl' or 'token-2022'
  - `is_verified`    (bool) — from DAS authorities or Jupiter verified tag
  - `sources`        (text[]) — which sources discovered this token: 'jupiter','dexscreener','birdeye','wallet','raydium','meteora','das'
  - `price_usd`      (numeric, nullable)
  - `price_change_24h` (numeric, nullable)
  - `volume_24h`     (numeric, nullable)
  - `liquidity_usd`  (numeric, nullable)
  - `market_cap`     (numeric, nullable)
  - `pair_address`   (text, nullable) — best DexScreener pair address for charting
  - `first_seen_at`  (timestamptz)
  - `updated_at`     (timestamptz)

  ## Indexes
  - Full-text search on symbol + name via `to_tsvector`
  - Index on updated_at for cache invalidation queries

  ## Security
  - RLS enabled
  - Public read (token metadata is public)
  - Service role / anon can upsert (client discovers and registers tokens)
*/

CREATE TABLE IF NOT EXISTS solana_token_registry (
  mint             text PRIMARY KEY,
  symbol           text        NOT NULL DEFAULT '',
  name             text        NOT NULL DEFAULT '',
  decimals         integer     NOT NULL DEFAULT 6,
  logo_uri         text,
  metadata_uri     text,
  token_program    text        NOT NULL DEFAULT 'spl',
  is_verified      boolean     NOT NULL DEFAULT false,
  sources          text[]      NOT NULL DEFAULT '{}',
  price_usd        numeric,
  price_change_24h numeric,
  volume_24h       numeric,
  liquidity_usd    numeric,
  market_cap       numeric,
  pair_address     text,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Full-text search index
CREATE INDEX IF NOT EXISTS solana_registry_fts
  ON solana_token_registry
  USING gin(to_tsvector('simple', coalesce(symbol,'') || ' ' || coalesce(name,'')));

-- Lookup by symbol (exact / prefix)
CREATE INDEX IF NOT EXISTS solana_registry_symbol
  ON solana_token_registry (lower(symbol));

-- Lookup by updated_at for stale-cache queries
CREATE INDEX IF NOT EXISTS solana_registry_updated
  ON solana_token_registry (updated_at DESC);

ALTER TABLE solana_token_registry ENABLE ROW LEVEL SECURITY;

-- Anyone can read
CREATE POLICY "Public can read token registry"
  ON solana_token_registry
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Authenticated and anon can upsert (client-side discovery)
CREATE POLICY "Anyone can upsert token registry"
  ON solana_token_registry
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update token registry"
  ON solana_token_registry
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
