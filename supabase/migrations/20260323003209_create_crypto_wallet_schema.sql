/*
  # CryptoWallet X - Complete Database Schema

  ## Overview
  This migration creates the complete database infrastructure for the CryptoWallet X application,
  including support for multiple blockchains, tokens, NFTs, dApps, user analytics, and price tracking.

  ## 1. New Tables

  ### blockchains
  Core blockchain networks supported by the wallet
  - `id` (uuid, primary key) - Unique identifier
  - `name` (text) - Blockchain name (e.g., "Solana", "Ethereum")
  - `symbol` (text) - Native token symbol (e.g., "SOL", "ETH")
  - `chain_id` (text) - Chain ID for EVM chains
  - `rpc_url` (text) - Default RPC endpoint
  - `explorer_url` (text) - Block explorer URL
  - `logo_url` (text) - Blockchain logo
  - `is_active` (boolean) - Whether blockchain is enabled
  - `order_index` (integer) - Display order
  - `created_at` (timestamptz) - Creation timestamp

  ### tokens
  All supported tokens across blockchains
  - `id` (uuid, primary key) - Unique identifier
  - `blockchain_id` (uuid, foreign key) - Parent blockchain
  - `contract_address` (text) - Token contract address (null for native tokens)
  - `symbol` (text) - Token symbol (e.g., "USDC")
  - `name` (text) - Full token name
  - `decimals` (integer) - Token decimals
  - `logo_url` (text) - Token logo
  - `is_verified` (boolean) - Verified token flag
  - `coingecko_id` (text) - CoinGecko API identifier
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### token_prices
  Real-time and historical price data
  - `id` (uuid, primary key) - Unique identifier
  - `token_id` (uuid, foreign key) - Token reference
  - `price_usd` (decimal) - Current USD price
  - `price_eur` (decimal) - Current EUR price
  - `price_change_24h` (decimal) - 24h percentage change
  - `market_cap` (decimal) - Market capitalization
  - `volume_24h` (decimal) - 24h trading volume
  - `updated_at` (timestamptz) - Price update timestamp

  ### dapps
  Curated list of dApps for the browser
  - `id` (uuid, primary key) - Unique identifier
  - `name` (text) - dApp name
  - `description` (text) - Description
  - `url` (text) - dApp URL
  - `logo_url` (text) - Logo image
  - `category` (text) - Category (DeFi, NFT, Gaming, etc.)
  - `blockchain_id` (uuid, foreign key) - Primary blockchain
  - `is_featured` (boolean) - Featured flag
  - `order_index` (integer) - Display order
  - `created_at` (timestamptz) - Creation timestamp

  ### nft_collections
  NFT collections metadata
  - `id` (uuid, primary key) - Unique identifier
  - `blockchain_id` (uuid, foreign key) - Blockchain reference
  - `contract_address` (text) - Collection contract address
  - `name` (text) - Collection name
  - `symbol` (text) - Collection symbol
  - `description` (text) - Description
  - `image_url` (text) - Collection image
  - `floor_price` (decimal) - Floor price
  - `total_supply` (integer) - Total NFTs in collection
  - `is_verified` (boolean) - Verification status
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### analytics_events
  Anonymous usage analytics (opt-in)
  - `id` (uuid, primary key) - Unique identifier
  - `event_type` (text) - Event type (app_open, transaction_sent, etc.)
  - `blockchain_id` (uuid, foreign key, nullable) - Related blockchain
  - `metadata` (jsonb) - Additional event data
  - `created_at` (timestamptz) - Event timestamp

  ### system_alerts
  System-wide alerts and notifications
  - `id` (uuid, primary key) - Unique identifier
  - `title` (text) - Alert title
  - `message` (text) - Alert message
  - `severity` (text) - Severity level (info, warning, critical)
  - `is_active` (boolean) - Active flag
  - `start_date` (timestamptz) - Alert start time
  - `end_date` (timestamptz, nullable) - Alert end time
  - `created_at` (timestamptz) - Creation timestamp

  ## 2. Security
  - All tables have RLS enabled
  - Public read access for reference data (blockchains, tokens, dapps)
  - Authenticated write access restricted to admin operations
  - Analytics events are insert-only for authenticated users

  ## 3. Indexes
  - Performance indexes on frequently queried columns
  - Foreign key indexes for joins
  - Composite indexes for common query patterns

  ## 4. Initial Data
  - Seeded with popular blockchains (Solana, Ethereum, Polygon, Base)
  - Common tokens (native tokens, stablecoins)
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- BLOCKCHAINS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS blockchains (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  symbol text NOT NULL,
  chain_id text,
  rpc_url text NOT NULL,
  explorer_url text NOT NULL,
  logo_url text,
  is_active boolean DEFAULT true,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blockchains_active ON blockchains(is_active, order_index);

ALTER TABLE blockchains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active blockchains"
  ON blockchains FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated users can view all blockchains"
  ON blockchains FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- TOKENS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  blockchain_id uuid NOT NULL REFERENCES blockchains(id) ON DELETE CASCADE,
  contract_address text,
  symbol text NOT NULL,
  name text NOT NULL,
  decimals integer NOT NULL DEFAULT 9,
  logo_url text,
  is_verified boolean DEFAULT false,
  coingecko_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(blockchain_id, contract_address)
);

CREATE INDEX IF NOT EXISTS idx_tokens_blockchain ON tokens(blockchain_id);
CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON tokens(symbol);
CREATE INDEX IF NOT EXISTS idx_tokens_verified ON tokens(is_verified);
CREATE INDEX IF NOT EXISTS idx_tokens_coingecko ON tokens(coingecko_id) WHERE coingecko_id IS NOT NULL;

ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view verified tokens"
  ON tokens FOR SELECT
  USING (is_verified = true);

CREATE POLICY "Authenticated users can view all tokens"
  ON tokens FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- TOKEN PRICES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS token_prices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_id uuid NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  price_usd decimal(20, 10),
  price_eur decimal(20, 10),
  price_change_24h decimal(10, 2),
  market_cap decimal(20, 2),
  volume_24h decimal(20, 2),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(token_id)
);

CREATE INDEX IF NOT EXISTS idx_token_prices_token ON token_prices(token_id);
CREATE INDEX IF NOT EXISTS idx_token_prices_updated ON token_prices(updated_at DESC);

ALTER TABLE token_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view token prices"
  ON token_prices FOR SELECT
  USING (true);

-- ============================================================================
-- DAPPS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS dapps (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  url text NOT NULL,
  logo_url text,
  category text NOT NULL,
  blockchain_id uuid REFERENCES blockchains(id) ON DELETE SET NULL,
  is_featured boolean DEFAULT false,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dapps_category ON dapps(category);
CREATE INDEX IF NOT EXISTS idx_dapps_featured ON dapps(is_featured, order_index);
CREATE INDEX IF NOT EXISTS idx_dapps_blockchain ON dapps(blockchain_id);

ALTER TABLE dapps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view dApps"
  ON dapps FOR SELECT
  USING (true);

-- ============================================================================
-- NFT COLLECTIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS nft_collections (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  blockchain_id uuid NOT NULL REFERENCES blockchains(id) ON DELETE CASCADE,
  contract_address text NOT NULL,
  name text NOT NULL,
  symbol text,
  description text,
  image_url text,
  floor_price decimal(20, 10),
  total_supply integer,
  is_verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(blockchain_id, contract_address)
);

CREATE INDEX IF NOT EXISTS idx_nft_collections_blockchain ON nft_collections(blockchain_id);
CREATE INDEX IF NOT EXISTS idx_nft_collections_verified ON nft_collections(is_verified);

ALTER TABLE nft_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view verified NFT collections"
  ON nft_collections FOR SELECT
  USING (is_verified = true);

CREATE POLICY "Authenticated users can view all NFT collections"
  ON nft_collections FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- ANALYTICS EVENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type text NOT NULL,
  blockchain_id uuid REFERENCES blockchains(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_blockchain ON analytics_events(blockchain_id);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert analytics events"
  ON analytics_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- SYSTEM ALERTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_alerts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  message text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  is_active boolean DEFAULT true,
  start_date timestamptz DEFAULT now(),
  end_date timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_alerts_active ON system_alerts(is_active, start_date);

ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active system alerts"
  ON system_alerts FOR SELECT
  USING (
    is_active = true 
    AND start_date <= now() 
    AND (end_date IS NULL OR end_date >= now())
  );

-- ============================================================================
-- SEED DATA: BLOCKCHAINS
-- ============================================================================
INSERT INTO blockchains (name, symbol, chain_id, rpc_url, explorer_url, logo_url, order_index) VALUES
  ('Solana', 'SOL', NULL, 'https://api.mainnet-beta.solana.com', 'https://solscan.io', 'https://cryptologos.cc/logos/solana-sol-logo.png', 1),
  ('Ethereum', 'ETH', '1', 'https://eth.llamarpc.com', 'https://etherscan.io', 'https://cryptologos.cc/logos/ethereum-eth-logo.png', 2),
  ('Polygon', 'MATIC', '137', 'https://polygon-rpc.com', 'https://polygonscan.com', 'https://cryptologos.cc/logos/polygon-matic-logo.png', 3),
  ('Base', 'ETH', '8453', 'https://mainnet.base.org', 'https://basescan.org', 'https://assets.coingecko.com/coins/images/32090/small/base.png', 4)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- SEED DATA: TOKENS (Native tokens and popular stablecoins)
-- ============================================================================
DO $$
DECLARE
  solana_id uuid;
  ethereum_id uuid;
  polygon_id uuid;
  base_id uuid;
BEGIN
  SELECT id INTO solana_id FROM blockchains WHERE symbol = 'SOL' LIMIT 1;
  SELECT id INTO ethereum_id FROM blockchains WHERE symbol = 'ETH' AND chain_id = '1' LIMIT 1;
  SELECT id INTO polygon_id FROM blockchains WHERE symbol = 'MATIC' LIMIT 1;
  SELECT id INTO base_id FROM blockchains WHERE symbol = 'ETH' AND chain_id = '8453' LIMIT 1;

  -- Solana tokens
  IF solana_id IS NOT NULL THEN
    INSERT INTO tokens (blockchain_id, contract_address, symbol, name, decimals, is_verified, coingecko_id) VALUES
      (solana_id, NULL, 'SOL', 'Solana', 9, true, 'solana'),
      (solana_id, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'USDC', 'USD Coin', 6, true, 'usd-coin'),
      (solana_id, 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 'USDT', 'Tether USD', 6, true, 'tether')
    ON CONFLICT (blockchain_id, contract_address) DO NOTHING;
  END IF;

  -- Ethereum tokens
  IF ethereum_id IS NOT NULL THEN
    INSERT INTO tokens (blockchain_id, contract_address, symbol, name, decimals, is_verified, coingecko_id) VALUES
      (ethereum_id, NULL, 'ETH', 'Ethereum', 18, true, 'ethereum'),
      (ethereum_id, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'USDC', 'USD Coin', 6, true, 'usd-coin'),
      (ethereum_id, '0xdAC17F958D2ee523a2206206994597C13D831ec7', 'USDT', 'Tether USD', 6, true, 'tether')
    ON CONFLICT (blockchain_id, contract_address) DO NOTHING;
  END IF;

  -- Polygon tokens
  IF polygon_id IS NOT NULL THEN
    INSERT INTO tokens (blockchain_id, contract_address, symbol, name, decimals, is_verified, coingecko_id) VALUES
      (polygon_id, NULL, 'MATIC', 'Polygon', 18, true, 'matic-network'),
      (polygon_id, '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', 'USDC', 'USD Coin', 6, true, 'usd-coin'),
      (polygon_id, '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', 'USDT', 'Tether USD', 6, true, 'tether')
    ON CONFLICT (blockchain_id, contract_address) DO NOTHING;
  END IF;

  -- Base tokens
  IF base_id IS NOT NULL THEN
    INSERT INTO tokens (blockchain_id, contract_address, symbol, name, decimals, is_verified, coingecko_id) VALUES
      (base_id, NULL, 'ETH', 'Ethereum', 18, true, 'ethereum'),
      (base_id, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 'USDC', 'USD Coin', 6, true, 'usd-coin')
    ON CONFLICT (blockchain_id, contract_address) DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- SEED DATA: POPULAR DAPPS
-- ============================================================================
DO $$
DECLARE
  solana_id uuid;
  ethereum_id uuid;
BEGIN
  SELECT id INTO solana_id FROM blockchains WHERE symbol = 'SOL' LIMIT 1;
  SELECT id INTO ethereum_id FROM blockchains WHERE symbol = 'ETH' AND chain_id = '1' LIMIT 1;

  INSERT INTO dapps (name, description, url, category, blockchain_id, is_featured, order_index) VALUES
    ('Uniswap', 'Leading decentralized exchange', 'https://app.uniswap.org', 'DeFi', ethereum_id, true, 1),
    ('Raydium', 'Automated market maker on Solana', 'https://raydium.io', 'DeFi', solana_id, true, 2),
    ('Magic Eden', 'NFT marketplace', 'https://magiceden.io', 'NFT', solana_id, true, 3),
    ('OpenSea', 'Largest NFT marketplace', 'https://opensea.io', 'NFT', ethereum_id, true, 4),
    ('Jupiter', 'Solana swap aggregator', 'https://jup.ag', 'DeFi', solana_id, true, 5),
    ('Aave', 'Lending and borrowing protocol', 'https://app.aave.com', 'DeFi', ethereum_id, false, 6)
  ON CONFLICT DO NOTHING;
END $$;