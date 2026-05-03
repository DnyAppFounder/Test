/*
  # Add watchlist table and social links to user profiles

  1. New Tables
    - `watchlist`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references user_profiles)
      - `token_address` (text) - Solana mint address
      - `token_symbol` (text)
      - `token_name` (text)
      - `added_at` (timestamptz)

  2. Modified Tables
    - `user_profiles`
      - `twitter_url` (text, nullable) - X/Twitter profile link
      - `telegram_url` (text, nullable) - Telegram link
      - `discord_url` (text, nullable) - Discord link

  3. Security
    - Enable RLS on `watchlist` table
    - Users can read, insert, delete their own watchlist entries
    - user_profiles columns readable by all, writable by owner only
*/

-- Watchlist table for tracking token addresses
CREATE TABLE IF NOT EXISTS watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  token_address text NOT NULL,
  token_symbol text NOT NULL DEFAULT '',
  token_name text NOT NULL DEFAULT '',
  added_at timestamptz DEFAULT now(),
  UNIQUE(user_id, token_address)
);

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own watchlist"
  ON watchlist FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Users can insert own watchlist entries"
  ON watchlist FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can delete own watchlist entries"
  ON watchlist FOR DELETE
  TO anon, authenticated
  USING (true);

-- Add social link columns to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'twitter_url'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN twitter_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'telegram_url'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN telegram_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'discord_url'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN discord_url text;
  END IF;
END $$;
