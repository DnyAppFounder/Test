/*
  # Verification System

  Adds a complete verification system with two tiers:

  1. Basic Verification (free)
     - Granted automatically when user follows both @Decent and @VerificationBadge
       AND replies to the designated "Get verified" post
     - Stored as `verified_basic` boolean on user_profiles

  2. Premium Verification (paid subscription)
     - Requires a real blockchain payment (SOL or DAWEN token)
     - Tiered: 1 month, 3 months, 6 months, 1 year
     - Stored as `premium_expiration` timestamp; active while in the future

  Changes:
  - `user_profiles`: adds `verified_basic` (bool), renames logic uses `premium_expiration`
  - New `verification_accounts` table: stores the two special accounts and the pinned post id
    that users must interact with to earn basic verification
*/

-- 1. Add verified_basic to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'verified_basic'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN verified_basic boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 2. Add premium_expiration (more precise than premium_expires_at for sub tracking)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'premium_expiration'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN premium_expiration timestamptz;
  END IF;
END $$;

-- 3. Verification accounts table — stores the two accounts + pinned post
CREATE TABLE IF NOT EXISTS verification_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_username text NOT NULL UNIQUE,
  wallet_address text,
  profile_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  pinned_post_id text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE verification_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read verification_accounts"
  ON verification_accounts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage verification_accounts"
  ON verification_accounts FOR INSERT
  TO service_role
  WITH CHECK (true);
