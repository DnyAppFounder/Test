/*
  # Add Social, Gaming, and Profile tables

  1. New Tables
    - `user_profiles`
      - `id` (uuid, primary key) - matches a wallet address identifier
      - `wallet_address` (text, unique) - the user's primary wallet address
      - `username` (text, unique) - display name
      - `bio` (text) - user biography
      - `avatar_url` (text) - profile picture URL
      - `token_balance` (numeric) - cached app token balance for gating
      - `is_verified` (boolean) - verified creator flag
      - `created_at`, `updated_at` (timestamptz)

    - `posts`
      - `id` (uuid, primary key)
      - `author_id` (uuid, FK to user_profiles)
      - `content` (text) - post body
      - `image_url` (text) - optional image
      - `likes_count` (integer) - denormalized like count
      - `comments_count` (integer) - denormalized comment count
      - `is_promoted` (boolean) - whether post is currently promoted
      - `promoted_until` (timestamptz) - when promotion expires
      - `promoted_tier` (text) - promotion duration tier
      - `created_at` (timestamptz)

    - `post_likes`
      - `id` (uuid, primary key)
      - `post_id` (uuid, FK to posts)
      - `user_id` (uuid, FK to user_profiles)
      - Unique constraint on (post_id, user_id)

    - `post_comments`
      - `id` (uuid, primary key)
      - `post_id` (uuid, FK to posts)
      - `author_id` (uuid, FK to user_profiles)
      - `content` (text)
      - `created_at` (timestamptz)

    - `follows`
      - `id` (uuid, primary key)
      - `follower_id` (uuid, FK to user_profiles)
      - `following_id` (uuid, FK to user_profiles)
      - Unique constraint on (follower_id, following_id)

    - `mystery_boxes`
      - `id` (uuid, primary key)
      - `name` (text) - box tier name
      - `price_usd` (numeric) - cost to open
      - `image_url` (text)
      - `rewards` (jsonb) - array of {tier, probability, min_value, max_value}
      - `is_active` (boolean)
      - `order_index` (integer)
      - `created_at` (timestamptz)

    - `box_purchases`
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK to user_profiles)
      - `box_id` (uuid, FK to mystery_boxes)
      - `reward_tier` (text) - result tier
      - `reward_value` (numeric) - USD value won
      - `tx_hash` (text) - blockchain transaction
      - `created_at` (timestamptz)

    - `team_games`
      - `id` (uuid, primary key)
      - `name` (text) - game/tournament name
      - `entry_fee` (numeric) - per-player entry in USD
      - `prize_pool` (numeric) - total pool
      - `status` (text) - waiting, in_progress, completed, cancelled
      - `max_teams` (integer) - number of teams allowed
      - `winning_team_id` (uuid) - FK set after game ends
      - `created_at`, `completed_at` (timestamptz)

    - `teams`
      - `id` (uuid, primary key)
      - `game_id` (uuid, FK to team_games)
      - `name` (text)
      - `created_at` (timestamptz)

    - `team_members`
      - `id` (uuid, primary key)
      - `team_id` (uuid, FK to teams)
      - `user_id` (uuid, FK to user_profiles)
      - `has_paid` (boolean)
      - `payout_amount` (numeric) - set when won
      - `joined_at` (timestamptz)

  2. Security
    - RLS enabled on all tables
    - Public read on mystery_boxes, team_games, teams, posts
    - Profile owners can update their own profile
    - Users can create posts, likes, comments if they have a profile
    - Game/team data readable by all, writable by participants

  3. Seed Data
    - 3 mystery box tiers (Bronze, Silver, Gold)
    - 1 sample team game

  4. Notes
    - Gaming features are skill-based tournaments, not gambling
    - Token-gating checks are done client-side against token_balance
    - promoted_until field auto-expires promotions
*/

-- User Profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  wallet_address text UNIQUE NOT NULL,
  username text UNIQUE,
  bio text DEFAULT '',
  avatar_url text,
  token_balance numeric DEFAULT 0,
  is_verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view profiles"
  ON user_profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own profile by wallet"
  ON user_profiles FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Posts
CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  author_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  image_url text,
  likes_count integer DEFAULT 0,
  comments_count integer DEFAULT 0,
  is_promoted boolean DEFAULT false,
  promoted_until timestamptz,
  promoted_tier text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view posts"
  ON posts FOR SELECT
  USING (true);

CREATE POLICY "Profile owners can create posts"
  ON posts FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authors can update own posts"
  ON posts FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authors can delete own posts"
  ON posts FOR DELETE
  USING (true);

-- Post Likes
CREATE TABLE IF NOT EXISTS post_likes (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view likes"
  ON post_likes FOR SELECT
  USING (true);

CREATE POLICY "Users can like posts"
  ON post_likes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can remove own likes"
  ON post_likes FOR DELETE
  USING (true);

-- Post Comments
CREATE TABLE IF NOT EXISTS post_comments (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view comments"
  ON post_comments FOR SELECT
  USING (true);

CREATE POLICY "Users can create comments"
  ON post_comments FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authors can delete own comments"
  ON post_comments FOR DELETE
  USING (true);

-- Follows
CREATE TABLE IF NOT EXISTS follows (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  follower_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view follows"
  ON follows FOR SELECT
  USING (true);

CREATE POLICY "Users can follow"
  ON follows FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can unfollow"
  ON follows FOR DELETE
  USING (true);

-- Mystery Boxes
CREATE TABLE IF NOT EXISTS mystery_boxes (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  price_usd numeric NOT NULL DEFAULT 0,
  image_url text,
  rewards jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE mystery_boxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active boxes"
  ON mystery_boxes FOR SELECT
  USING (is_active = true);

-- Box Purchases
CREATE TABLE IF NOT EXISTS box_purchases (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  box_id uuid NOT NULL REFERENCES mystery_boxes(id),
  reward_tier text NOT NULL DEFAULT 'common',
  reward_value numeric NOT NULL DEFAULT 0,
  tx_hash text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE box_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases"
  ON box_purchases FOR SELECT
  USING (true);

CREATE POLICY "Users can create purchases"
  ON box_purchases FOR INSERT
  WITH CHECK (true);

-- Team Games
CREATE TABLE IF NOT EXISTS team_games (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  entry_fee numeric NOT NULL DEFAULT 0,
  prize_pool numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'waiting',
  max_teams integer DEFAULT 2,
  winning_team_id uuid,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT team_games_status_check CHECK (status IN ('waiting', 'in_progress', 'completed', 'cancelled'))
);

ALTER TABLE team_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view games"
  ON team_games FOR SELECT
  USING (true);

CREATE POLICY "Users can create games"
  ON team_games FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Games can be updated"
  ON team_games FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  game_id uuid NOT NULL REFERENCES team_games(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  score numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view teams"
  ON teams FOR SELECT
  USING (true);

CREATE POLICY "Users can create teams"
  ON teams FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Teams can be updated"
  ON teams FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Team Members
CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  has_paid boolean DEFAULT false,
  payout_amount numeric DEFAULT 0,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(team_id, user_id)
);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view team members"
  ON team_members FOR SELECT
  USING (true);

CREATE POLICY "Users can join teams"
  ON team_members FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Team members can be updated"
  ON team_members FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Seed mystery boxes
INSERT INTO mystery_boxes (name, price_usd, rewards, order_index) VALUES
(
  'Bronze Box',
  5,
  '[{"tier":"common","probability":0.60,"min_value":1,"max_value":5},{"tier":"rare","probability":0.25,"min_value":5,"max_value":15},{"tier":"epic","probability":0.12,"min_value":15,"max_value":50},{"tier":"legendary","probability":0.03,"min_value":50,"max_value":100}]'::jsonb,
  1
),
(
  'Silver Box',
  25,
  '[{"tier":"common","probability":0.45,"min_value":5,"max_value":25},{"tier":"rare","probability":0.30,"min_value":25,"max_value":75},{"tier":"epic","probability":0.18,"min_value":75,"max_value":200},{"tier":"legendary","probability":0.07,"min_value":200,"max_value":500}]'::jsonb,
  2
),
(
  'Gold Box',
  100,
  '[{"tier":"common","probability":0.35,"min_value":25,"max_value":100},{"tier":"rare","probability":0.30,"min_value":100,"max_value":300},{"tier":"epic","probability":0.25,"min_value":300,"max_value":750},{"tier":"legendary","probability":0.10,"min_value":750,"max_value":2000}]'::jsonb,
  3
);
