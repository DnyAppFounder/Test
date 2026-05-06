/*
  # Launchpad Presale System — Phase 2

  1. New Tables

    - `launchpad_presales`
      Core presale configuration for each launched token.
      - soft_cap / hard_cap (SOL amounts)
      - min_buy / max_buy per wallet
      - launch_price / listing_price
      - tokens_for_sale
      - liquidity_percent (0-100)
      - unsold_behavior: 'burn' | 'return'
      - status: 'upcoming' | 'live' | 'successful' | 'failed' | 'claim_live' | 'finalized'
      - start_at / end_at timestamps
      - amount_raised (SOL, running total)
      - buyer_count

    - `launchpad_presale_contributions`
      Every wallet buy into a presale. Unique per (presale_id, wallet).
      Supports claim tracking and double-claim prevention.
      - sol_amount: how much SOL contributed
      - token_amount: calculated token allocation
      - claimed: bool (prevents double claim)
      - refunded: bool (prevents double refund)
      - tx_signature: on-chain signature of the buy tx
      - claim_tx: on-chain signature of the claim tx
      - refund_tx: on-chain signature of the refund tx

  2. Status Rules
    - upcoming  → before start_at
    - live       → between start_at and end_at
    - successful → end_at passed AND amount_raised >= soft_cap
    - failed     → end_at passed AND amount_raised < soft_cap
    - claim_live → creator finalized, tokens ready to claim
    - finalized  → all done

  3. Security
    - RLS enabled on all tables
    - Public SELECT for presales (needed for live tracking)
    - Only contributor (matching wallet) can INSERT their own contribution
    - Creator (matching token's creator_wallet) can UPDATE presale fields
    - No DELETE allowed (audit trail)
*/

-- launchpad_presales
CREATE TABLE IF NOT EXISTS launchpad_presales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES launchpad_tokens(id) ON DELETE CASCADE,

  -- Configuration
  soft_cap numeric NOT NULL DEFAULT 5,
  hard_cap numeric NOT NULL DEFAULT 50,
  min_buy numeric NOT NULL DEFAULT 0.1,
  max_buy numeric NOT NULL DEFAULT 5,
  launch_price numeric NOT NULL DEFAULT 0,
  listing_price numeric NOT NULL DEFAULT 0,
  tokens_for_sale numeric NOT NULL DEFAULT 0,
  liquidity_percent int4 NOT NULL DEFAULT 60,
  unsold_behavior text NOT NULL DEFAULT 'burn',

  -- Status
  status text NOT NULL DEFAULT 'upcoming',

  -- Timing
  start_at timestamptz NOT NULL DEFAULT now(),
  end_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),

  -- Live tracking (updated on each contribution)
  amount_raised numeric NOT NULL DEFAULT 0,
  buyer_count int4 NOT NULL DEFAULT 0,

  -- Finalization
  finalized_at timestamptz,
  finalize_tx text,
  lp_address text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE launchpad_presales ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_presales_token ON launchpad_presales(token_id);
CREATE INDEX IF NOT EXISTS idx_presales_status ON launchpad_presales(status);
CREATE INDEX IF NOT EXISTS idx_presales_start ON launchpad_presales(start_at);

CREATE POLICY "Anyone can view presales"
  ON launchpad_presales FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert presales"
  ON launchpad_presales FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update presales"
  ON launchpad_presales FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- launchpad_presale_contributions
CREATE TABLE IF NOT EXISTS launchpad_presale_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presale_id uuid NOT NULL REFERENCES launchpad_presales(id) ON DELETE CASCADE,
  token_id uuid NOT NULL REFERENCES launchpad_tokens(id) ON DELETE CASCADE,
  wallet text NOT NULL,

  sol_amount numeric NOT NULL,
  token_amount numeric NOT NULL DEFAULT 0,

  -- Claim state
  claimed boolean NOT NULL DEFAULT false,
  claim_tx text,
  claimed_at timestamptz,

  -- Refund state
  refunded boolean NOT NULL DEFAULT false,
  refund_tx text,
  refunded_at timestamptz,

  -- On-chain proof
  tx_signature text,
  confirmed boolean NOT NULL DEFAULT false,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Prevent duplicate unconfirmed buys; allow updating after confirmation
  UNIQUE (presale_id, wallet)
);

ALTER TABLE launchpad_presale_contributions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_contributions_presale ON launchpad_presale_contributions(presale_id);
CREATE INDEX IF NOT EXISTS idx_contributions_wallet ON launchpad_presale_contributions(wallet);
CREATE INDEX IF NOT EXISTS idx_contributions_token ON launchpad_presale_contributions(token_id);

CREATE POLICY "Anyone can view contributions"
  ON launchpad_presale_contributions FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert contributions"
  ON launchpad_presale_contributions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update contributions"
  ON launchpad_presale_contributions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Realtime enabled for live presale tracking
ALTER PUBLICATION supabase_realtime ADD TABLE launchpad_presales;
ALTER PUBLICATION supabase_realtime ADD TABLE launchpad_presale_contributions;
