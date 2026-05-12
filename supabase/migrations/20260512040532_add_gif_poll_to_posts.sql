/*
  # Add GIF and Poll support to posts

  1. Changes to `posts` table
    - `gif_url` (text, nullable) — direct Tenor GIF URL attached to post
    - `poll_options` (jsonb, nullable) — array of poll option strings e.g. ["Yes","No"]
    - `poll_expires_at` (timestamptz, nullable) — when voting closes

  2. New table: `poll_votes`
    - `id` uuid primary key
    - `post_id` uuid references posts(id) ON DELETE CASCADE
    - `voter_wallet` text — Solana wallet address
    - `option_index` int — 0-based chosen option
    - `created_at` timestamptz
    - UNIQUE(post_id, voter_wallet) — one vote per wallet per poll

  3. Security
    - RLS enabled on poll_votes
    - anon + authenticated can SELECT (public results)
    - anon + authenticated can INSERT (wallet uniqueness prevents double voting)
*/

ALTER TABLE posts ADD COLUMN IF NOT EXISTS gif_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS poll_options JSONB;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS poll_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  voter_wallet TEXT NOT NULL,
  option_index INT NOT NULL CHECK (option_index >= 0 AND option_index <= 3),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, voter_wallet)
);

ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read poll votes"
  ON poll_votes FOR SELECT
  TO anon, authenticated
  USING (TRUE);

CREATE POLICY "Anyone can cast a poll vote"
  ON poll_votes FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    voter_wallet IS NOT NULL
    AND length(voter_wallet) > 0
    AND option_index >= 0
    AND option_index <= 3
  );

GRANT SELECT, INSERT ON poll_votes TO anon, authenticated;
