/*
  # Extend posts table with new fields

  1. Changes to `posts` table
    - `media_url` (text) — URL for attached image/video (replaces image_url usage, kept for compat)
    - `token_address` (text) — Mint address of attached token
    - `token_symbol` (text) — Display symbol of attached token (e.g. SOL)
    - `token_price` (numeric) — Snapshot price at time of post
    - `token_change_24h` (numeric) — 24h % change at time of post
    - `visibility` (text DEFAULT 'public') — Post visibility: 'public' | 'followers'
    - `who_can_reply` (text DEFAULT 'everyone') — Reply permission: 'everyone' | 'followers' | 'mentioned'
    - `allow_quotes` (boolean DEFAULT true) — Whether quotes/reposts are allowed
    - `language` (text DEFAULT 'en') — Post language tag
    - `quote_post_id` (uuid) — Reference to the quoted post (for quote-reposts)

  2. Changes to `post_comments` table
    - `parent_comment_id` (uuid) — NULL = top-level comment; set = reply to a comment
    - `likes_count` (integer DEFAULT 0) — Denormalized like count for comments
    - `replies_count` (integer DEFAULT 0) — Denormalized reply count

  3. New table `comment_likes`
    - Tracks which users liked which comments

  4. Security
    - Existing RLS on posts/post_comments already covers new columns
    - Enable RLS on comment_likes with appropriate policies
*/

-- Extend posts table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'media_url') THEN
    ALTER TABLE posts ADD COLUMN media_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'token_address') THEN
    ALTER TABLE posts ADD COLUMN token_address text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'token_symbol') THEN
    ALTER TABLE posts ADD COLUMN token_symbol text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'token_price') THEN
    ALTER TABLE posts ADD COLUMN token_price numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'token_change_24h') THEN
    ALTER TABLE posts ADD COLUMN token_change_24h numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'visibility') THEN
    ALTER TABLE posts ADD COLUMN visibility text DEFAULT 'public';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'who_can_reply') THEN
    ALTER TABLE posts ADD COLUMN who_can_reply text DEFAULT 'everyone';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'allow_quotes') THEN
    ALTER TABLE posts ADD COLUMN allow_quotes boolean DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'language') THEN
    ALTER TABLE posts ADD COLUMN language text DEFAULT 'en';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'quote_post_id') THEN
    ALTER TABLE posts ADD COLUMN quote_post_id uuid REFERENCES posts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Extend post_comments table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'post_comments' AND column_name = 'parent_comment_id') THEN
    ALTER TABLE post_comments ADD COLUMN parent_comment_id uuid REFERENCES post_comments(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'post_comments' AND column_name = 'likes_count') THEN
    ALTER TABLE post_comments ADD COLUMN likes_count integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'post_comments' AND column_name = 'replies_count') THEN
    ALTER TABLE post_comments ADD COLUMN replies_count integer DEFAULT 0;
  END IF;
END $$;

-- Create comment_likes table
CREATE TABLE IF NOT EXISTS comment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view comment likes"
  ON comment_likes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own comment likes"
  ON comment_likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comment likes"
  ON comment_likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user_id ON comment_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_parent ON post_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_posts_token_address ON posts(token_address);
