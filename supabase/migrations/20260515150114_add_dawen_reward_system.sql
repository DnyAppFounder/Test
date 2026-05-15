/*
  # DAWEN Reward System — Full Implementation

  ## Overview
  Implements the DawenWorld token reward system including:
  - Early user rewards (first 100 members get 10,000 DWC)
  - Referral rewards (referrer: 300 DWC, referred: 150 DWC)
  - Secure claimable reward records with on-chain transaction tracking

  ## New Tables

  ### user_rewards
  Tracks all claimable token rewards per user. Status lifecycle:
  ready → claiming (locked by edge function) → sent (token transferred) / failed

  ### reward_settings
  Key-value config for reward amounts, token mint, and limits.
  Seeded with production values on migration run.

  ## Changes to Existing Tables

  ### referral_codes
  Updated generate_referral_code() to prefix all new codes with "DAWEN-"

  ### referrals
  Added status, qualified_at, referred_wallet_address columns

  ## New Functions / Triggers

  ### check_and_grant_early_user_reward(user_id, wallet_address)
  Called automatically when a new user_profiles row is inserted.
  Counts the user's position and grants 10,000 DWC reward if within first 100.

  ### trg_new_user_profile_early_reward
  Trigger on user_profiles AFTER INSERT that fires check_and_grant_early_user_reward.

  ## Security
  - RLS enabled on all new tables
  - SELECT open to anon/authenticated (app uses wallet-address identity, no Supabase Auth)
  - INSERT/UPDATE/DELETE restricted to service_role only (all writes go through edge functions)
  - This matches the pattern used by duel_entries, world_rooms, and all other tables in this app
*/

-- ─── user_rewards ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_rewards (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  wallet_address        text        NOT NULL DEFAULT '',
  reward_token_mint     text        NOT NULL DEFAULT 'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump',
  reward_amount         integer     NOT NULL DEFAULT 0,
  reason                text        NOT NULL,
  status                text        NOT NULL DEFAULT 'ready'
                                    CHECK (status IN ('ready','claiming','sent','failed')),
  transaction_signature text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  claimed_at            timestamptz,
  sent_at               timestamptz
);

CREATE INDEX IF NOT EXISTS idx_user_rewards_user_id         ON user_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_rewards_wallet          ON user_rewards(wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_rewards_status          ON user_rewards(status);
CREATE INDEX IF NOT EXISTS idx_user_rewards_reason          ON user_rewards(reason);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_rewards_early_unique
  ON user_rewards(user_id) WHERE reason = 'early_user_first_100';

ALTER TABLE user_rewards ENABLE ROW LEVEL SECURITY;

-- Anon/authenticated can read (client filters by wallet_address; app uses wallet-based identity)
CREATE POLICY "user_rewards_select"
  ON user_rewards FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only service_role writes (edge functions use service key)
CREATE POLICY "user_rewards_insert_service"
  ON user_rewards FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "user_rewards_update_service"
  ON user_rewards FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── reward_settings ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reward_settings (
  key        text        PRIMARY KEY,
  value      text        NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reward_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reward_settings_select"
  ON reward_settings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "reward_settings_write_service"
  ON reward_settings FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "reward_settings_update_service"
  ON reward_settings FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed default config
INSERT INTO reward_settings (key, value) VALUES
  ('dawenworld_reward_token_mint',   'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump'),
  ('early_user_first_100_amount',    '10000'),
  ('referral_referrer_amount',       '300'),
  ('referral_referred_amount',       '150'),
  ('first_100_limit',                '100')
ON CONFLICT (key) DO NOTHING;

-- ─── Extend referrals table ───────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'referrals' AND column_name = 'status'
  ) THEN
    ALTER TABLE referrals ADD COLUMN status text NOT NULL DEFAULT 'pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'referrals' AND column_name = 'qualified_at'
  ) THEN
    ALTER TABLE referrals ADD COLUMN qualified_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'referrals' AND column_name = 'referred_wallet_address'
  ) THEN
    ALTER TABLE referrals ADD COLUMN referred_wallet_address text;
  END IF;
END $$;

-- ─── Update generate_referral_code to produce DAWEN- codes ───────────────────

CREATE OR REPLACE FUNCTION generate_referral_code(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code    text;
  v_base    text;
  v_username text;
  v_exists  boolean;
BEGIN
  SELECT username INTO v_username FROM user_profiles WHERE id = p_user_id;

  IF v_username IS NOT NULL AND length(v_username) >= 3 THEN
    -- Username-based: DAWEN-USERNAME (max 8 chars of username, uppercased)
    v_base := upper(substring(v_username from 1 for 8));
  ELSE
    -- Random 6-char alphanumeric
    v_base := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
  END IF;

  v_code := 'DAWEN-' || v_base;

  -- Ensure uniqueness
  SELECT EXISTS(SELECT 1 FROM referral_codes WHERE code = v_code) INTO v_exists;
  WHILE v_exists LOOP
    v_code := 'DAWEN-' || v_base || upper(substring(md5(random()::text) from 1 for 2));
    SELECT EXISTS(SELECT 1 FROM referral_codes WHERE code = v_code) INTO v_exists;
  END LOOP;

  RETURN v_code;
END;
$$;

-- ─── Early user reward function ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_and_grant_early_user_reward(p_user_id uuid, p_wallet_address text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rank   bigint;
  v_limit  integer := 100;
  v_amount integer := 10000;
  v_mint   text    := 'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump';
BEGIN
  -- Skip if already granted
  IF EXISTS (
    SELECT 1 FROM user_rewards
    WHERE user_id = p_user_id AND reason = 'early_user_first_100'
  ) THEN
    RETURN;
  END IF;

  -- Rank = number of profiles created strictly before this one + 1
  SELECT COUNT(*) + 1 INTO v_rank
  FROM user_profiles
  WHERE created_at < (SELECT created_at FROM user_profiles WHERE id = p_user_id);

  IF v_rank <= v_limit THEN
    INSERT INTO user_rewards (user_id, wallet_address, reward_token_mint, reward_amount, reason, status)
    VALUES (
      p_user_id,
      COALESCE(p_wallet_address, ''),
      v_mint,
      v_amount,
      'early_user_first_100',
      'ready'
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- ─── Trigger: grant early user reward on new profile creation ─────────────────

CREATE OR REPLACE FUNCTION trg_fn_early_user_reward()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM check_and_grant_early_user_reward(NEW.id, NEW.wallet_address);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_user_profile_early_reward ON user_profiles;
CREATE TRIGGER trg_new_user_profile_early_reward
  AFTER INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_early_user_reward();

-- ─── Back-fill early user rewards for existing users ─────────────────────────

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, wallet_address
    FROM user_profiles
    ORDER BY created_at ASC
    LIMIT 100
  LOOP
    PERFORM check_and_grant_early_user_reward(r.id, r.wallet_address);
  END LOOP;
END $$;

-- ─── Function to create referral rewards (called from edge function or service) ─

CREATE OR REPLACE FUNCTION create_referral_rewards(
  p_referrer_user_id uuid,
  p_referrer_wallet   text,
  p_referred_user_id  uuid,
  p_referred_wallet   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_amount integer := 300;
  v_referred_amount integer := 150;
  v_mint            text    := 'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump';
BEGIN
  -- Referrer reward
  INSERT INTO user_rewards (user_id, wallet_address, reward_token_mint, reward_amount, reason, status)
  VALUES (p_referrer_user_id, COALESCE(p_referrer_wallet, ''), v_mint, v_referrer_amount, 'referral_referrer', 'ready');

  -- Referred user reward
  INSERT INTO user_rewards (user_id, wallet_address, reward_token_mint, reward_amount, reason, status)
  VALUES (p_referred_user_id, COALESCE(p_referred_wallet, ''), v_mint, v_referred_amount, 'referral_referred', 'ready');
END;
$$;
