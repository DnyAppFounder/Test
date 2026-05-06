/*
  # Phase 4 — DAWEN Launchpad: Bonding Curve, Burns, Fees, Safety, Trending

  ## New Tables

  ### dawen_curve_state
  - Tracks bonding curve state per launchpad token
  - Fields: token_id (FK launchpad_tokens), mint_address, supply_sold, current_price, graduation_threshold,
    graduated (bool), graduation_tx, created_at, updated_at

  ### burn_events
  - Records every DAWEN/token burn event triggered by trading/swaps/launchpad
  - Fields: id, token_mint, burn_amount, burn_type (trade/swap/launch/manual), trigger_tx,
    burner_wallet, created_at

  ### fee_events
  - Tracks every fee collected by type
  - Fields: id, fee_type (launch/trading/promotion/verification/presale), amount_sol, amount_usd,
    token_mint, payer_wallet, tx_signature, created_at

  ### safety_scores
  - Cached safety/risk analysis per token
  - Fields: id, token_mint, risk_score (0-100), mint_authority_revoked, freeze_authority_revoked,
    lp_locked, lp_lock_pct, honeypot_detected, tax_buy_pct, tax_sell_pct, top10_holders_pct,
    scam_signals (jsonb), last_checked_at, created_at

  ### trending_scores
  - Composite trending score per token (refreshed periodically)
  - Fields: id, token_mint, score, volume_score, holder_score, buy_pressure_score,
    liquidity_score, social_score, growth_score, rank, computed_at

  ## Security
  - RLS enabled on all tables
  - Public read for safety_scores, trending_scores, burn_events, fee_events
  - Insert/update restricted to authenticated users or service role
*/

-- dawen_curve_state
CREATE TABLE IF NOT EXISTS dawen_curve_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid REFERENCES launchpad_tokens(id) ON DELETE CASCADE,
  mint_address text NOT NULL,
  supply_sold numeric NOT NULL DEFAULT 0,
  current_price numeric NOT NULL DEFAULT 0,
  graduation_threshold numeric NOT NULL DEFAULT 50000,
  market_cap_usd numeric NOT NULL DEFAULT 0,
  graduated boolean NOT NULL DEFAULT false,
  graduation_tx text,
  pool_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dawen_curve_state_token_id_idx ON dawen_curve_state(token_id);
CREATE INDEX IF NOT EXISTS dawen_curve_state_mint_idx ON dawen_curve_state(mint_address);
CREATE INDEX IF NOT EXISTS dawen_curve_state_graduated_idx ON dawen_curve_state(graduated);

ALTER TABLE dawen_curve_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read curve state"
  ON dawen_curve_state FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can insert curve state"
  ON dawen_curve_state FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update curve state"
  ON dawen_curve_state FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- burn_events
CREATE TABLE IF NOT EXISTS burn_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint text NOT NULL,
  burn_amount numeric NOT NULL DEFAULT 0,
  burn_type text NOT NULL DEFAULT 'trade' CHECK (burn_type IN ('trade','swap','launch','manual','presale')),
  trigger_tx text,
  burner_wallet text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS burn_events_token_mint_idx ON burn_events(token_mint);
CREATE INDEX IF NOT EXISTS burn_events_burner_idx ON burn_events(burner_wallet);
CREATE INDEX IF NOT EXISTS burn_events_created_idx ON burn_events(created_at DESC);

ALTER TABLE burn_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read burn events"
  ON burn_events FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can insert burn events"
  ON burn_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- fee_events
CREATE TABLE IF NOT EXISTS fee_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_type text NOT NULL DEFAULT 'trading' CHECK (fee_type IN ('launch','trading','promotion','verification','presale')),
  amount_sol numeric NOT NULL DEFAULT 0,
  amount_usd numeric,
  token_mint text,
  payer_wallet text NOT NULL,
  tx_signature text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fee_events_type_idx ON fee_events(fee_type);
CREATE INDEX IF NOT EXISTS fee_events_payer_idx ON fee_events(payer_wallet);
CREATE INDEX IF NOT EXISTS fee_events_token_idx ON fee_events(token_mint);
CREATE INDEX IF NOT EXISTS fee_events_created_idx ON fee_events(created_at DESC);

ALTER TABLE fee_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read fee events"
  ON fee_events FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can insert fee events"
  ON fee_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- safety_scores
CREATE TABLE IF NOT EXISTS safety_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint text NOT NULL,
  risk_score integer NOT NULL DEFAULT 50 CHECK (risk_score >= 0 AND risk_score <= 100),
  mint_authority_revoked boolean NOT NULL DEFAULT false,
  freeze_authority_revoked boolean NOT NULL DEFAULT false,
  lp_locked boolean NOT NULL DEFAULT false,
  lp_lock_pct numeric NOT NULL DEFAULT 0,
  honeypot_detected boolean NOT NULL DEFAULT false,
  tax_buy_pct numeric NOT NULL DEFAULT 0,
  tax_sell_pct numeric NOT NULL DEFAULT 0,
  top10_holders_pct numeric NOT NULL DEFAULT 0,
  scam_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS safety_scores_mint_idx ON safety_scores(token_mint);
CREATE INDEX IF NOT EXISTS safety_scores_risk_idx ON safety_scores(risk_score);

ALTER TABLE safety_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read safety scores"
  ON safety_scores FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can insert safety scores"
  ON safety_scores FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update safety scores"
  ON safety_scores FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- trending_scores
CREATE TABLE IF NOT EXISTS trending_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint text NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  volume_score numeric NOT NULL DEFAULT 0,
  holder_score numeric NOT NULL DEFAULT 0,
  buy_pressure_score numeric NOT NULL DEFAULT 0,
  liquidity_score numeric NOT NULL DEFAULT 0,
  social_score numeric NOT NULL DEFAULT 0,
  growth_score numeric NOT NULL DEFAULT 0,
  rank integer,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS trending_scores_mint_idx ON trending_scores(token_mint);
CREATE INDEX IF NOT EXISTS trending_scores_score_idx ON trending_scores(score DESC);
CREATE INDEX IF NOT EXISTS trending_scores_rank_idx ON trending_scores(rank);

ALTER TABLE trending_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read trending scores"
  ON trending_scores FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can insert trending scores"
  ON trending_scores FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update trending scores"
  ON trending_scores FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
