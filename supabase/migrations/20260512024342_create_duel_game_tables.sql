/*
  # DAWEN Rush Duel — Game Tables

  ## Overview
  Creates the complete schema for the DAWEN Rush Duel skill-based game system.

  ## New Tables

  ### duel_entries
  Tracks each player's entry into a SOL Duel match. Created only after on-chain
  payment is confirmed. Includes wallet, amount, payment signature, and status lifecycle.

  ### duel_matches
  Represents a 1v1 match between two duel entries. Holds the deterministic map seed,
  scores, winner, payout details, and payout status.

  ### game_results
  Stores per-player game performance data including score, survival time, orbs,
  combos, accuracy, and raw_actions for anti-cheat validation.

  ### game_leaderboard_scores
  Aggregated per-user stats for leaderboard queries (wins, best score, SOL won, etc.)

  ### game_admin_records
  Audit trail for failed payouts, failed refunds, disputed matches, and
  anti-cheat flags — so admins can review and resolve.

  ## Security
  - RLS enabled on all tables
  - Entries readable by owner only (except leaderboard which is public)
  - Only service_role can write match/result data
  - Public leaderboard read access
*/

-- ─── duel_entries ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS duel_entries (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  wallet_address       text NOT NULL,
  username             text,
  avatar_url           text,
  badge_status         text DEFAULT 'none',
  entry_amount_sol     numeric(18,9) NOT NULL CHECK (entry_amount_sol > 0),
  payment_tx_signature text,
  refund_tx_signature  text,
  status               text NOT NULL DEFAULT 'waiting'
                       CHECK (status IN ('waiting','matched','completed','refunded','refund_failed','cancelled')),
  mode                 text NOT NULL DEFAULT 'sol_duel'
                       CHECK (mode IN ('free','ranked','sol_duel')),
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_duel_entries_wallet  ON duel_entries(wallet_address);
CREATE INDEX IF NOT EXISTS idx_duel_entries_status  ON duel_entries(status);
CREATE INDEX IF NOT EXISTS idx_duel_entries_amount  ON duel_entries(entry_amount_sol);
CREATE INDEX IF NOT EXISTS idx_duel_entries_created ON duel_entries(created_at);

ALTER TABLE duel_entries ENABLE ROW LEVEL SECURITY;

-- Owners can read their own entries
CREATE POLICY "Owner can read own duel entries"
  ON duel_entries FOR SELECT
  TO authenticated
  USING (
    wallet_address = (
      SELECT wallet_address FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Anon can read waiting/matched entries for matchmaking display (no sensitive data)
CREATE POLICY "Anyone can read non-sensitive waiting entries"
  ON duel_entries FOR SELECT
  TO anon
  USING (status = 'waiting' OR status = 'matched');

-- Only service role can insert/update (all writes go through edge functions)
CREATE POLICY "Service role can insert duel entries"
  ON duel_entries FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update duel entries"
  ON duel_entries FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── duel_matches ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS duel_matches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_amount_sol    numeric(18,9) NOT NULL,
  match_seed          text NOT NULL,
  player1_entry_id    uuid NOT NULL REFERENCES duel_entries(id),
  player2_entry_id    uuid NOT NULL REFERENCES duel_entries(id),
  player1_user_id     uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  player2_user_id     uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  player1_wallet      text NOT NULL,
  player2_wallet      text NOT NULL,
  player1_result_id   uuid,
  player2_result_id   uuid,
  player1_score       integer,
  player2_score       integer,
  winner_user_id      uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  winner_wallet       text,
  total_pot_sol       numeric(18,9),
  platform_fee_sol    numeric(18,9),
  winner_payout_sol   numeric(18,9),
  payout_tx_signature text,
  payout_status       text NOT NULL DEFAULT 'pending'
                      CHECK (payout_status IN ('pending','paid','failed')),
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','completed','disputed','completed_with_failed_payout')),
  created_at          timestamptz DEFAULT now(),
  completed_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_duel_matches_p1   ON duel_matches(player1_wallet);
CREATE INDEX IF NOT EXISTS idx_duel_matches_p2   ON duel_matches(player2_wallet);
CREATE INDEX IF NOT EXISTS idx_duel_matches_status ON duel_matches(status);

ALTER TABLE duel_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can read their own matches"
  ON duel_matches FOR SELECT
  TO authenticated
  USING (
    player1_wallet = (SELECT wallet_address FROM user_profiles WHERE id = auth.uid())
    OR
    player2_wallet = (SELECT wallet_address FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Service role can manage matches"
  ON duel_matches FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update matches"
  ON duel_matches FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── game_results ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS game_results (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id          uuid REFERENCES duel_matches(id) ON DELETE SET NULL,
  entry_id          uuid REFERENCES duel_entries(id) ON DELETE SET NULL,
  user_id           uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  wallet_address    text NOT NULL,
  mode              text NOT NULL CHECK (mode IN ('free','ranked','sol_duel')),
  score             integer NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 10000),
  survival_time_ms  integer NOT NULL DEFAULT 0,
  orbs_collected    integer NOT NULL DEFAULT 0,
  obstacles_hit     integer NOT NULL DEFAULT 0,
  traps_hit         integer NOT NULL DEFAULT 0,
  combo_max         integer NOT NULL DEFAULT 0,
  accuracy          numeric(5,4) NOT NULL DEFAULT 0,
  raw_actions       jsonb,
  session_id        text NOT NULL,
  map_seed          text,
  created_at        timestamptz DEFAULT now(),
  UNIQUE(session_id)
);

CREATE INDEX IF NOT EXISTS idx_game_results_wallet  ON game_results(wallet_address);
CREATE INDEX IF NOT EXISTS idx_game_results_score   ON game_results(score DESC);
CREATE INDEX IF NOT EXISTS idx_game_results_mode    ON game_results(mode);
CREATE INDEX IF NOT EXISTS idx_game_results_match   ON game_results(match_id);

ALTER TABLE game_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can read own results"
  ON game_results FOR SELECT
  TO authenticated
  USING (
    wallet_address = (SELECT wallet_address FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Anon can read ranked results for leaderboard"
  ON game_results FOR SELECT
  TO anon
  USING (mode = 'ranked' OR mode = 'sol_duel');

CREATE POLICY "Service role can manage results"
  ON game_results FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update results"
  ON game_results FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── game_leaderboard_scores ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS game_leaderboard_scores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  wallet_address      text NOT NULL UNIQUE,
  username            text,
  avatar_url          text,
  badge_status        text DEFAULT 'none',
  best_score          integer NOT NULL DEFAULT 0,
  best_survival_ms    integer NOT NULL DEFAULT 0,
  best_combo          integer NOT NULL DEFAULT 0,
  total_games         integer NOT NULL DEFAULT 0,
  ranked_games        integer NOT NULL DEFAULT 0,
  duel_wins           integer NOT NULL DEFAULT 0,
  duel_losses         integer NOT NULL DEFAULT 0,
  duel_total          integer NOT NULL DEFAULT 0,
  total_sol_won       numeric(18,9) NOT NULL DEFAULT 0,
  total_sol_wagered   numeric(18,9) NOT NULL DEFAULT 0,
  win_rate            numeric(5,4) NOT NULL DEFAULT 0,
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_score  ON game_leaderboard_scores(best_score DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_wins   ON game_leaderboard_scores(duel_wins DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_sol    ON game_leaderboard_scores(total_sol_won DESC);

ALTER TABLE game_leaderboard_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read leaderboard"
  ON game_leaderboard_scores FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated can read leaderboard"
  ON game_leaderboard_scores FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage leaderboard"
  ON game_leaderboard_scores FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update leaderboard"
  ON game_leaderboard_scores FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── game_admin_records ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS game_admin_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type   text NOT NULL CHECK (record_type IN (
    'failed_payout','failed_refund','disputed_match',
    'duplicate_submission','invalid_score','anti_cheat_flag'
  )),
  match_id      uuid REFERENCES duel_matches(id) ON DELETE SET NULL,
  entry_id      uuid REFERENCES duel_entries(id) ON DELETE SET NULL,
  wallet_address text,
  details       jsonb NOT NULL DEFAULT '{}',
  resolved      boolean NOT NULL DEFAULT false,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE game_admin_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage admin records"
  ON game_admin_records FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update admin records"
  ON game_admin_records FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
