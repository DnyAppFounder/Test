/*
  # Staking Rewards System

  1. New Tables
    - `staking_pools`
      - `id` (uuid, primary key)
      - `token_id` (uuid, references tokens)
      - `name` (text)
      - `apy` (numeric) - Annual percentage yield
      - `min_stake` (numeric)
      - `lock_period_days` (integer)
      - `total_staked` (numeric)
      - `is_active` (boolean)
      - `created_at` (timestamptz)
    
    - `user_stakes`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references user_profiles)
      - `pool_id` (uuid, references staking_pools)
      - `amount` (numeric)
      - `rewards_earned` (numeric)
      - `staked_at` (timestamptz)
      - `unlock_at` (timestamptz)
      - `unstaked_at` (timestamptz)
      - `status` (text) - 'active', 'completed', 'withdrawn'

  2. Security
    - Enable RLS on all tables
    - Users can read all pools
    - Users can read/update their own stakes
*/

CREATE TABLE IF NOT EXISTS staking_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid REFERENCES tokens(id) ON DELETE CASCADE,
  name text NOT NULL,
  apy numeric NOT NULL CHECK (apy >= 0),
  min_stake numeric NOT NULL CHECK (min_stake >= 0),
  lock_period_days integer NOT NULL CHECK (lock_period_days >= 0),
  total_staked numeric DEFAULT 0 CHECK (total_staked >= 0),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_stakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  pool_id uuid REFERENCES staking_pools(id) ON DELETE CASCADE NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  rewards_earned numeric DEFAULT 0 CHECK (rewards_earned >= 0),
  staked_at timestamptz DEFAULT now(),
  unlock_at timestamptz NOT NULL,
  unstaked_at timestamptz,
  status text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'withdrawn'))
);

CREATE INDEX IF NOT EXISTS idx_staking_pools_active ON staking_pools(is_active);
CREATE INDEX IF NOT EXISTS idx_user_stakes_user_id ON user_stakes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stakes_status ON user_stakes(status);

ALTER TABLE staking_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stakes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active staking pools"
  ON staking_pools FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Users can read own stakes"
  ON user_stakes FOR SELECT
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM user_profiles WHERE id = user_stakes.user_id));

CREATE POLICY "Users can create own stakes"
  ON user_stakes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (SELECT id FROM user_profiles WHERE id = user_stakes.user_id));

CREATE POLICY "Users can update own stakes"
  ON user_stakes FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM user_profiles WHERE id = user_stakes.user_id))
  WITH CHECK (auth.uid() IN (SELECT id FROM user_profiles WHERE id = user_stakes.user_id));
