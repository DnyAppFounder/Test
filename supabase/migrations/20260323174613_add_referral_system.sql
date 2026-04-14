/*
  # Referral System

  1. New Tables
    - `referral_codes`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references user_profiles)
      - `code` (text, unique) - The referral code
      - `uses` (integer) - How many times code has been used
      - `created_at` (timestamptz)
    
    - `referrals`
      - `id` (uuid, primary key)
      - `referrer_id` (uuid, references user_profiles) - Who referred
      - `referred_id` (uuid, references user_profiles) - Who was referred
      - `referral_code` (text) - The code that was used
      - `reward_claimed` (boolean) - Whether reward was given
      - `created_at` (timestamptz)
    
    - `referral_rewards`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references user_profiles)
      - `referral_id` (uuid, references referrals)
      - `reward_type` (text) - 'bonus_tokens', 'trading_fee_discount', etc.
      - `reward_amount` (numeric)
      - `claimed` (boolean)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Users can read their own referral codes
    - Users can read their own referrals and rewards
    - Anyone can verify a referral code exists (for signup)
*/

-- Create referral_codes table
CREATE TABLE IF NOT EXISTS referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  code text UNIQUE NOT NULL,
  uses integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create referrals table
CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  referred_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  referral_code text NOT NULL,
  reward_claimed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(referred_id)
);

-- Create referral_rewards table
CREATE TABLE IF NOT EXISTS referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  referral_id uuid REFERENCES referrals(id) ON DELETE CASCADE,
  reward_type text NOT NULL,
  reward_amount numeric DEFAULT 0,
  claimed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id ON referral_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_id ON referrals(referred_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_user_id ON referral_rewards(user_id);

-- Enable RLS
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

-- Policies for referral_codes
CREATE POLICY "Users can read own referral codes"
  ON referral_codes FOR SELECT
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM user_profiles WHERE id = referral_codes.user_id));

CREATE POLICY "Users can create own referral codes"
  ON referral_codes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (SELECT id FROM user_profiles WHERE id = referral_codes.user_id));

CREATE POLICY "Anyone can verify referral codes exist"
  ON referral_codes FOR SELECT
  TO authenticated
  USING (true);

-- Policies for referrals
CREATE POLICY "Users can read referrals where they are referrer"
  ON referrals FOR SELECT
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM user_profiles WHERE id = referrals.referrer_id));

CREATE POLICY "Users can read referrals where they are referred"
  ON referrals FOR SELECT
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM user_profiles WHERE id = referrals.referred_id));

CREATE POLICY "Users can create referrals for themselves"
  ON referrals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (SELECT id FROM user_profiles WHERE id = referrals.referred_id));

-- Policies for referral_rewards
CREATE POLICY "Users can read own rewards"
  ON referral_rewards FOR SELECT
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM user_profiles WHERE id = referral_rewards.user_id));

CREATE POLICY "System can create rewards"
  ON referral_rewards FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own rewards"
  ON referral_rewards FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM user_profiles WHERE id = referral_rewards.user_id))
  WITH CHECK (auth.uid() IN (SELECT id FROM user_profiles WHERE id = referral_rewards.user_id));

-- Function to generate unique referral code
CREATE OR REPLACE FUNCTION generate_referral_code(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_code text;
  v_username text;
  v_exists boolean;
BEGIN
  -- Get username
  SELECT username INTO v_username FROM user_profiles WHERE id = p_user_id;
  
  -- Generate code from username or random
  IF v_username IS NOT NULL THEN
    v_code := upper(substring(v_username from 1 for 6)) || floor(random() * 1000)::text;
  ELSE
    v_code := upper(substring(md5(random()::text) from 1 for 8));
  END IF;
  
  -- Check if code exists
  SELECT EXISTS(SELECT 1 FROM referral_codes WHERE code = v_code) INTO v_exists;
  
  -- If exists, add random suffix
  WHILE v_exists LOOP
    v_code := v_code || floor(random() * 10)::text;
    SELECT EXISTS(SELECT 1 FROM referral_codes WHERE code = v_code) INTO v_exists;
  END LOOP;
  
  RETURN v_code;
END;
$$;
