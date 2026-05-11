/*
  # Add pending_promote_tier to user_profiles

  1. Changes
    - `user_profiles`: add `pending_promote_tier` (text, nullable)
      Stores the promote tier key (e.g. '1h', '3h', '24h', '3d', '7d') when a
      user has paid for a post promotion but has not yet published the promoted
      post.  NULL = no pending credit.  Cleared to NULL once the credit is consumed.

  2. Security
    - Existing RLS policies on user_profiles cover this column automatically.
    - Authenticated users can only update their own row via the existing UPDATE policy.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'pending_promote_tier'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN pending_promote_tier text DEFAULT NULL;
  END IF;
END $$;
