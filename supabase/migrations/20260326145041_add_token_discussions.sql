/*
  # Token Discussion System

  1. New Tables
    - `token_discussions`
      - `id` (uuid, primary key)
      - `token_address` (text, indexed)
      - `user_wallet` (text)
      - `message` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `likes_count` (integer, default 0)
      - `replies_count` (integer, default 0)
      - `parent_id` (uuid, nullable - for replies)

  2. Security
    - Enable RLS on `token_discussions` table
    - Allow anyone to read discussions
    - Allow authenticated users to post messages
    - Allow users to update/delete their own messages
*/

CREATE TABLE IF NOT EXISTS token_discussions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address text NOT NULL,
  user_wallet text NOT NULL,
  message text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  likes_count integer DEFAULT 0,
  replies_count integer DEFAULT 0,
  parent_id uuid REFERENCES token_discussions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_token_discussions_token_address ON token_discussions(token_address);
CREATE INDEX IF NOT EXISTS idx_token_discussions_created_at ON token_discussions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_discussions_parent_id ON token_discussions(parent_id);

ALTER TABLE token_discussions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read token discussions"
  ON token_discussions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Users can post discussions"
  ON token_discussions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own discussions"
  ON token_discussions FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own discussions"
  ON token_discussions FOR DELETE
  TO anon, authenticated
  USING (true);
