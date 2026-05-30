/*
  # Add display_name and is_founder to user_profiles

  1. Changes
    - `user_profiles.display_name` (text) — public display name separate from username
    - `user_profiles.is_founder` (boolean, default false) — marks the app founder/owner
      Founder has full DAWEN Crew permissions and appears at the top of the hierarchy.

  2. Notes
    - display_name is optional; UI falls back to username when null
    - is_founder can only be set by the service role (migration or admin SQL)
    - No new RLS needed — existing user_profiles policies cover reads
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'display_name'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN display_name text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'is_founder'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN is_founder boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_profiles_is_founder ON user_profiles(is_founder) WHERE is_founder = true;
