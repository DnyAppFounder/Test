/*
  # Add Watchlist Feature

  1. New Tables
    - `watchlist`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `token_address` (text, the token contract address)
      - `token_symbol` (text)
      - `token_name` (text)
      - `added_at` (timestamp)
      - Unique constraint on (user_id, token_address)

  2. Security
    - Enable RLS on `watchlist` table
    - Add policies for authenticated users to manage their own watchlist
*/

CREATE TABLE IF NOT EXISTS watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  token_address text NOT NULL,
  token_symbol text NOT NULL,
  token_name text NOT NULL,
  added_at timestamptz DEFAULT now(),
  UNIQUE(user_id, token_address)
);

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own watchlist"
  ON watchlist FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add to own watchlist"
  ON watchlist FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove from own watchlist"
  ON watchlist FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_token_address ON watchlist(token_address);
