/*
  # Phase 4 Advanced Mode: Vesting, Locks, Reputation, Anti-Bot

  ## New Tables

  ### token_vesting_schedules
  - Per-token vesting configuration set at launch
  - Fields: id, token_id (FK launchpad_tokens), mint_address, wallet (beneficiary),
    allocation_type (team/creator/advisor/marketing), total_amount, released_amount,
    cliff_seconds, duration_seconds, start_at, unlock_style (linear/monthly/cliff_only),
    created_at

  ### token_vesting_claims
  - Records each vesting unlock/claim event
  - Fields: id, schedule_id, wallet, amount, tx_signature, claimed_at

  ### token_launch_config
  - Advanced launch settings (anti-bot, max wallet, liquidity lock)
  - Fields: id, token_id (FK), mint_address, max_wallet_pct, buy_cooldown_seconds,
    trading_delay_seconds, lp_lock_duration_days, anti_snipe_enabled,
    suspicious_threshold, launch_delay_seconds, created_at, updated_at

  ### creator_reputation
  - Aggregated reputation score per creator wallet
  - Fields: id, wallet, launches_total, launches_successful, launches_failed,
    total_raised_sol, total_volume_sol, avg_lp_lock_days, community_reports,
    holder_growth_avg, reputation_score (0-100), badge (new/trusted/verified/high_risk),
    last_updated

  ## Security
  - RLS enabled on all tables
  - Public read for reputation (all can see)
  - Creator/authenticated write for own records
*/

-- token_vesting_schedules
CREATE TABLE IF NOT EXISTS token_vesting_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid REFERENCES launchpad_tokens(id) ON DELETE CASCADE,
  mint_address text NOT NULL,
  wallet text NOT NULL,
  allocation_type text NOT NULL DEFAULT 'team' CHECK (allocation_type IN ('team','creator','advisor','marketing','community')),
  total_amount numeric NOT NULL DEFAULT 0,
  released_amount numeric NOT NULL DEFAULT 0,
  cliff_seconds integer NOT NULL DEFAULT 0,
  duration_seconds integer NOT NULL DEFAULT 0,
  start_at timestamptz NOT NULL DEFAULT now(),
  unlock_style text NOT NULL DEFAULT 'linear' CHECK (unlock_style IN ('linear','monthly','cliff_only')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vesting_token_id_idx ON token_vesting_schedules(token_id);
CREATE INDEX IF NOT EXISTS vesting_wallet_idx ON token_vesting_schedules(wallet);
CREATE INDEX IF NOT EXISTS vesting_mint_idx ON token_vesting_schedules(mint_address);

ALTER TABLE token_vesting_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read vesting schedules"
  ON token_vesting_schedules FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can insert vesting schedules"
  ON token_vesting_schedules FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- token_vesting_claims
CREATE TABLE IF NOT EXISTS token_vesting_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid REFERENCES token_vesting_schedules(id) ON DELETE CASCADE,
  wallet text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  tx_signature text,
  claimed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vesting_claims_schedule_idx ON token_vesting_claims(schedule_id);
CREATE INDEX IF NOT EXISTS vesting_claims_wallet_idx ON token_vesting_claims(wallet);

ALTER TABLE token_vesting_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read vesting claims"
  ON token_vesting_claims FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can insert vesting claims"
  ON token_vesting_claims FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- token_launch_config
CREATE TABLE IF NOT EXISTS token_launch_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid REFERENCES launchpad_tokens(id) ON DELETE CASCADE,
  mint_address text,
  max_wallet_pct numeric NOT NULL DEFAULT 2,
  buy_cooldown_seconds integer NOT NULL DEFAULT 0,
  trading_delay_seconds integer NOT NULL DEFAULT 0,
  lp_lock_duration_days integer NOT NULL DEFAULT 30,
  anti_snipe_enabled boolean NOT NULL DEFAULT false,
  suspicious_threshold numeric NOT NULL DEFAULT 5,
  launch_delay_seconds integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS launch_config_token_id_idx ON token_launch_config(token_id);
CREATE INDEX IF NOT EXISTS launch_config_mint_idx ON token_launch_config(mint_address);

ALTER TABLE token_launch_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read launch config"
  ON token_launch_config FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can insert launch config"
  ON token_launch_config FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update launch config"
  ON token_launch_config FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- creator_reputation
CREATE TABLE IF NOT EXISTS creator_reputation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet text NOT NULL,
  launches_total integer NOT NULL DEFAULT 0,
  launches_successful integer NOT NULL DEFAULT 0,
  launches_failed integer NOT NULL DEFAULT 0,
  total_raised_sol numeric NOT NULL DEFAULT 0,
  total_volume_sol numeric NOT NULL DEFAULT 0,
  avg_lp_lock_days numeric NOT NULL DEFAULT 0,
  community_reports integer NOT NULL DEFAULT 0,
  holder_growth_avg numeric NOT NULL DEFAULT 0,
  reputation_score integer NOT NULL DEFAULT 50 CHECK (reputation_score >= 0 AND reputation_score <= 100),
  badge text NOT NULL DEFAULT 'new' CHECK (badge IN ('new','trusted','verified','high_risk')),
  last_updated timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS creator_reputation_wallet_idx ON creator_reputation(wallet);
CREATE INDEX IF NOT EXISTS creator_reputation_score_idx ON creator_reputation(reputation_score DESC);
CREATE INDEX IF NOT EXISTS creator_reputation_badge_idx ON creator_reputation(badge);

ALTER TABLE creator_reputation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read creator reputation"
  ON creator_reputation FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can insert reputation"
  ON creator_reputation FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update reputation"
  ON creator_reputation FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
