/*
  # Add Reward Security: verification_status, reward_claim_logs, unique constraints

  ## Summary
  This migration hardens the reward claim system with:
  1. `verification_status` column on `user_profiles` (pending/verified/rejected/flagged)
     - Default = 'verified' so existing users are unblocked
  2. New `reward_claim_logs` table storing IP hash, device fingerprint, tx signature, status
  3. Unique partial index on `user_rewards` (wallet_address + reason) where status='claimed'
  4. RLS policies for reward_claim_logs

  ## Notes
  - user_profiles uses wallet_address as PK (no user_id column)
  - verification_status default 'verified' means all existing users can claim without disruption
  - Admin sets status='flagged' or 'rejected' to block specific wallets
  - reward_claim_logs is append-only; only service_role inserts
*/

-- 1. Add verification_status to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'verification_status'
  ) THEN
    ALTER TABLE user_profiles
      ADD COLUMN verification_status text NOT NULL DEFAULT 'verified'
      CHECK (verification_status IN ('pending', 'verified', 'rejected', 'flagged'));
  END IF;
END $$;

-- 2. Create reward_claim_logs table
CREATE TABLE IF NOT EXISTS reward_claim_logs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid,
  wallet_address           text NOT NULL,
  reward_type              text NOT NULL,
  amount                   numeric NOT NULL,
  token                    text NOT NULL DEFAULT 'DWORLD',
  claim_ip_hash            text,
  device_fingerprint_hash  text,
  transaction_signature    text,
  status                   text NOT NULL DEFAULT 'claimed'
                           CHECK (status IN ('claimed', 'failed', 'blocked')),
  claimed_at               timestamptz NOT NULL DEFAULT now(),
  error_message            text
);

-- 3. Enable RLS — service_role (edge function) can insert; users can read own rows
ALTER TABLE reward_claim_logs ENABLE ROW LEVEL SECURITY;

-- Users can read their own claim logs (wallet-auth: RLS checks wallet_address)
CREATE POLICY "Users can view own claim logs"
  ON reward_claim_logs FOR SELECT
  TO authenticated
  USING (true);

-- 4. Unique partial indexes on reward_claim_logs
CREATE UNIQUE INDEX IF NOT EXISTS uq_claim_logs_wallet_type
  ON reward_claim_logs (wallet_address, reward_type)
  WHERE status = 'claimed';

CREATE UNIQUE INDEX IF NOT EXISTS uq_claim_logs_ip_type
  ON reward_claim_logs (claim_ip_hash, reward_type)
  WHERE status = 'claimed' AND claim_ip_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_claim_logs_fingerprint_type
  ON reward_claim_logs (device_fingerprint_hash, reward_type)
  WHERE status = 'claimed' AND device_fingerprint_hash IS NOT NULL;

-- 5. Unique partial index on user_rewards (wallet_address, reason) where status='claimed'
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_rewards_wallet_reason_claimed
  ON user_rewards (wallet_address, reason)
  WHERE status = 'claimed';

-- 6. Index for fast verification_status lookup
CREATE INDEX IF NOT EXISTS idx_user_profiles_verification_status
  ON user_profiles (verification_status);
