/*
  # Add reposts table for Community X-like repost feature

  1. New Tables
    - `reposts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to user_profiles)
      - `post_id` (uuid, foreign key to posts)
      - `created_at` (timestamptz)
      - Unique constraint on (user_id, post_id) to prevent duplicate reposts

  2. Modified Tables
    - `posts` - Add `reposts_count` column with default 0

  3. Security
    - Enable RLS on `reposts` table
    - Add policies for authenticated users to manage their own reposts
    - Add public read policy for reposts
*/

CREATE TABLE IF NOT EXISTS reposts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, post_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'reposts_count'
  ) THEN
    ALTER TABLE posts ADD COLUMN reposts_count integer DEFAULT 0 NOT NULL;
  END IF;
END $$;

ALTER TABLE reposts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reposts"
  ON reposts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create their own reposts"
  ON reposts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id::text OR EXISTS (
    SELECT 1 FROM user_profiles WHERE id = user_id
  ));

CREATE POLICY "Users can delete their own reposts"
  ON reposts
  FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id::text OR EXISTS (
    SELECT 1 FROM user_profiles WHERE id = user_id
  ));
