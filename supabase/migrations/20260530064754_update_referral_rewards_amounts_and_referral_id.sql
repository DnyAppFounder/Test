/*
  # Update referral reward amounts and add referral_id tracking

  ## Changes

  1. Modified Tables
    - `user_rewards`
      - Add `referral_id` (uuid, nullable) — links a reward row back to the
        originating referral so the referral-payout edge function can look up
        both reward records by referral ID in one query.
      - Add index on `referral_id` for fast lookups.

  2. Modified Functions
    - `create_referral_rewards`
      - Referrer reward: 300 → 3,000 $DAWORLD
      - Referred reward: 150 → 5,000 $DAWORLD
      - Accepts new `p_referral_id uuid` parameter (nullable for backward
        compatibility) and stores it in the `referral_id` column.

  ## Notes
  - Old reward rows without `referral_id` continue to work; the column is
    nullable with no default.
  - The function uses ON CONFLICT DO NOTHING so it is safe to call multiple
    times for the same referral.
*/

-- 1. Add referral_id column to user_rewards
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_rewards' AND column_name = 'referral_id'
  ) THEN
    ALTER TABLE user_rewards ADD COLUMN referral_id uuid REFERENCES referrals(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_rewards_referral_id ON user_rewards(referral_id);

-- 2. Replace create_referral_rewards with updated amounts and referral_id support
CREATE OR REPLACE FUNCTION create_referral_rewards(
  p_referrer_user_id uuid,
  p_referrer_wallet  text,
  p_referred_user_id uuid,
  p_referred_wallet  text,
  p_referral_id      uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_amount  integer := 3000;
  v_referred_amount  integer := 5000;
  v_mint             text    := 'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump';
  v_referrer_wallet  text    := p_referrer_wallet;
BEGIN
  -- If referrer wallet was not provided, look it up from the profile
  IF v_referrer_wallet IS NULL OR trim(v_referrer_wallet) = '' THEN
    SELECT wallet_address INTO v_referrer_wallet
    FROM user_profiles
    WHERE id = p_referrer_user_id
    LIMIT 1;
  END IF;

  -- Referrer reward
  IF v_referrer_wallet IS NOT NULL AND trim(v_referrer_wallet) != '' THEN
    INSERT INTO user_rewards
      (user_id, wallet_address, reward_token_mint, reward_amount, reason, status, referral_id)
    VALUES
      (p_referrer_user_id, v_referrer_wallet, v_mint, v_referrer_amount, 'referral_referrer', 'ready', p_referral_id)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Referred user reward
  INSERT INTO user_rewards
    (user_id, wallet_address, reward_token_mint, reward_amount, reason, status, referral_id)
  VALUES
    (p_referred_user_id, COALESCE(p_referred_wallet, ''), v_mint, v_referred_amount, 'referral_referred', 'ready', p_referral_id)
  ON CONFLICT DO NOTHING;
END;
$$;
