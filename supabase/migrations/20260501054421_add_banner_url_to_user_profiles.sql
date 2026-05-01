/*
  # Add banner_url to user_profiles

  1. Changes
    - Adds `banner_url` (text, nullable) column to `user_profiles`
    - Allows users to set a custom cover/banner photo on their profile
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'banner_url'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN banner_url text;
  END IF;
END $$;
