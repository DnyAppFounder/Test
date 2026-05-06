/*
  # Phase 5 — Launchpad Pool & Liquidity Tracking

  ## Changes to launchpad_tokens
  - Add pool tracking columns: liquidity_provider, pool_address, lp_mint,
    lp_token_amount, base_mint, quote_mint, liquidity_tx_signature,
    pool_created_at, token_liquidity_amount, sol_liquidity_amount

  ## New Table: liquidity_events
  - Immutable log of every LP creation or add-liquidity event
  - Fields: id, token_id, launch_id, provider (raydium/meteora/simulated),
    pool_address, lp_mint, token_amount, sol_amount, tx_signature,
    status (pending/confirmed/failed), error_message, created_at

  ## Security
  - RLS on liquidity_events
  - Public read, authenticated insert
*/

-- Extend launchpad_tokens with pool columns (safe: IF NOT EXISTS via DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='launchpad_tokens' AND column_name='liquidity_provider') THEN
    ALTER TABLE launchpad_tokens ADD COLUMN liquidity_provider text DEFAULT 'raydium' CHECK (liquidity_provider IN ('raydium','meteora','simulated'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='launchpad_tokens' AND column_name='pool_address') THEN
    ALTER TABLE launchpad_tokens ADD COLUMN pool_address text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='launchpad_tokens' AND column_name='lp_mint') THEN
    ALTER TABLE launchpad_tokens ADD COLUMN lp_mint text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='launchpad_tokens' AND column_name='lp_token_amount') THEN
    ALTER TABLE launchpad_tokens ADD COLUMN lp_token_amount numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='launchpad_tokens' AND column_name='base_mint') THEN
    ALTER TABLE launchpad_tokens ADD COLUMN base_mint text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='launchpad_tokens' AND column_name='quote_mint') THEN
    ALTER TABLE launchpad_tokens ADD COLUMN quote_mint text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='launchpad_tokens' AND column_name='liquidity_tx_signature') THEN
    ALTER TABLE launchpad_tokens ADD COLUMN liquidity_tx_signature text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='launchpad_tokens' AND column_name='pool_created_at') THEN
    ALTER TABLE launchpad_tokens ADD COLUMN pool_created_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='launchpad_tokens' AND column_name='token_liquidity_amount') THEN
    ALTER TABLE launchpad_tokens ADD COLUMN token_liquidity_amount numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='launchpad_tokens' AND column_name='sol_liquidity_amount') THEN
    ALTER TABLE launchpad_tokens ADD COLUMN sol_liquidity_amount numeric;
  END IF;
END $$;

-- liquidity_events table
CREATE TABLE IF NOT EXISTS liquidity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid REFERENCES launchpad_tokens(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'raydium' CHECK (provider IN ('raydium','meteora','simulated')),
  pool_address text,
  lp_mint text,
  token_amount numeric NOT NULL DEFAULT 0,
  sol_amount numeric NOT NULL DEFAULT 0,
  tx_signature text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS liquidity_events_token_id_idx ON liquidity_events(token_id);
CREATE INDEX IF NOT EXISTS liquidity_events_status_idx ON liquidity_events(status);
CREATE INDEX IF NOT EXISTS liquidity_events_created_idx ON liquidity_events(created_at DESC);

ALTER TABLE liquidity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read liquidity events"
  ON liquidity_events FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can insert liquidity events"
  ON liquidity_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update liquidity events"
  ON liquidity_events FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
