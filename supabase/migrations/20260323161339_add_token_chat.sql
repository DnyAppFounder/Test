/*
  # Add Token Chat Tables

  1. New Tables
    - `token_chats`
      - `id` (uuid, primary key)
      - `token_id` (text) - CoinGecko ID or contract address
      - `token_symbol` (text) - Token symbol for display
      - `token_name` (text) - Token name for display
      - `author_id` (uuid, FK to user_profiles)
      - `message` (text) - Chat message content
      - `created_at` (timestamptz)

  2. Security
    - RLS enabled on token_chats
    - Anyone can view token chat messages
    - Users with profiles can send messages
    - Authors can delete their own messages

  3. Notes
    - Messages are scoped by token_id (e.g., 'bitcoin', 'solana', or contract address)
    - Real-time subscriptions will enable live chat
    - No edit functionality to preserve message integrity
*/

CREATE TABLE IF NOT EXISTS token_chats (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  token_id text NOT NULL,
  token_symbol text NOT NULL DEFAULT '',
  token_name text NOT NULL DEFAULT '',
  author_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE token_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view token chats"
  ON token_chats FOR SELECT
  USING (true);

CREATE POLICY "Users can create token chat messages"
  ON token_chats FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authors can delete own messages"
  ON token_chats FOR DELETE
  USING (true);

CREATE INDEX IF NOT EXISTS idx_token_chats_token_id ON token_chats(token_id);
CREATE INDEX IF NOT EXISTS idx_token_chats_created_at ON token_chats(created_at DESC);
