/*
  # Add token_logo_uri to posts

  Adds an optional column to store the token logo image URL alongside other
  token attachment fields. This allows the feed to display token logos without
  an extra network request.

  1. Modified Tables
    - `posts` — adds `token_logo_uri` (text, nullable)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'token_logo_uri'
  ) THEN
    ALTER TABLE posts ADD COLUMN token_logo_uri text;
  END IF;
END $$;
