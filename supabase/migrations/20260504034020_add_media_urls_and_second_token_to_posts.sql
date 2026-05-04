/*
  # Add multi-media and dual-token support to posts

  1. Changes to `posts` table
    - `media_urls` (text[]) — array of all media URLs for multi-image/video posts
    - `token_address_2` (text) — mint address of second token for comparison posts
    - `token_symbol_2` (text) — symbol of second token
    - `token_price_2` (numeric) — price of second token at post time
    - `token_change_24h_2` (numeric) — 24h % change of second token at post time
    - `token_logo_uri_2` (text) — logo URI of second token

  2. Notes
    - All columns use IF NOT EXISTS guards for idempotency
    - No data is removed or modified
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'media_urls'
  ) THEN
    ALTER TABLE posts ADD COLUMN media_urls text[];
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'token_address_2'
  ) THEN
    ALTER TABLE posts ADD COLUMN token_address_2 text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'token_symbol_2'
  ) THEN
    ALTER TABLE posts ADD COLUMN token_symbol_2 text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'token_price_2'
  ) THEN
    ALTER TABLE posts ADD COLUMN token_price_2 numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'token_change_24h_2'
  ) THEN
    ALTER TABLE posts ADD COLUMN token_change_24h_2 numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'token_logo_uri_2'
  ) THEN
    ALTER TABLE posts ADD COLUMN token_logo_uri_2 text;
  END IF;
END $$;
