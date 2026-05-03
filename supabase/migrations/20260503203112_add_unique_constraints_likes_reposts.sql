/*
  # Add unique constraints on likes and reposts tables

  ## Changes
  - `post_likes`: add unique constraint on (user_id, post_id) to prevent duplicate likes
  - `reposts`: add unique constraint on (user_id, post_id) to prevent duplicate reposts
  - `comment_likes`: add unique constraint on (user_id, comment_id) to prevent duplicate comment likes
  - Clean up any existing duplicate rows before adding constraints (keep earliest row)

  ## Purpose
  Ensures 1 user = 1 like per post, 1 user = 1 repost per post at the database level.
*/

-- Clean duplicate post_likes (keep earliest)
DELETE FROM post_likes
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, post_id) id
  FROM post_likes
  ORDER BY user_id, post_id, created_at ASC
);

-- Add unique constraint on post_likes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'post_likes' AND constraint_name = 'post_likes_user_post_unique'
  ) THEN
    ALTER TABLE post_likes ADD CONSTRAINT post_likes_user_post_unique UNIQUE (user_id, post_id);
  END IF;
END $$;

-- Clean duplicate reposts (keep earliest)
DELETE FROM reposts
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, post_id) id
  FROM reposts
  ORDER BY user_id, post_id, created_at ASC
);

-- Add unique constraint on reposts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'reposts' AND constraint_name = 'reposts_user_post_unique'
  ) THEN
    ALTER TABLE reposts ADD CONSTRAINT reposts_user_post_unique UNIQUE (user_id, post_id);
  END IF;
END $$;

-- Clean duplicate comment_likes (keep earliest)
DELETE FROM comment_likes
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, comment_id) id
  FROM comment_likes
  ORDER BY user_id, comment_id, created_at ASC
);

-- Add unique constraint on comment_likes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'comment_likes' AND constraint_name = 'comment_likes_user_comment_unique'
  ) THEN
    ALTER TABLE comment_likes ADD CONSTRAINT comment_likes_user_comment_unique UNIQUE (user_id, comment_id);
  END IF;
END $$;
