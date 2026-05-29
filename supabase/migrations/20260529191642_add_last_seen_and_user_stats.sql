/*
  # Add last_seen_at to user_profiles for online presence tracking

  ## Summary
  Adds a `last_seen_at` timestamp column to `user_profiles` to support the
  "Online Now" counter. Users are considered online if `last_seen_at` is within
  the last 2 minutes.

  ## Changes
  - `user_profiles` table: new nullable column `last_seen_at` (timestamptz)

  ## Security
  - New UPDATE policy: authenticated users can only update their own `last_seen_at`
  - SELECT for total user count is already covered by existing public read policy
  - No new tables, no RLS changes to other tables
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'last_seen_at'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN last_seen_at timestamptz;
  END IF;
END $$;

-- Policy: users can update only their own last_seen_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_profiles' AND policyname = 'Users can update own last_seen_at'
  ) THEN
    CREATE POLICY "Users can update own last_seen_at"
      ON user_profiles FOR UPDATE
      TO authenticated
      USING (wallet_address = current_setting('app.wallet_address', true))
      WITH CHECK (wallet_address = current_setting('app.wallet_address', true));
  END IF;
END $$;
