/*
  # Multi-Game Support

  Extends the duel/game tables to support multiple distinct games
  beyond Dawen Rush, using a game_id discriminator column.

  ## Changes

  1. duel_entries — add game_id TEXT DEFAULT 'dawen_rush'
  2. duel_matches — add game_id TEXT DEFAULT 'dawen_rush'
  3. game_results — add game_id TEXT DEFAULT 'dawen_rush'
     Extended stat columns (nullable) used by non-Rush games:
       hits, misses, pairs_found, fragments_found,
       distance_units, mistakes, completion_time_ms
  4. New indexes for per-game leaderboard queries

  ## Notes
  - All new columns default so existing Dawen Rush rows remain valid.
  - Matchmaking edge function must filter by game_id to avoid cross-game matches.
*/

-- 1. duel_entries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'duel_entries' AND column_name = 'game_id'
  ) THEN
    ALTER TABLE duel_entries ADD COLUMN game_id TEXT NOT NULL DEFAULT 'dawen_rush';
  END IF;
END $$;

-- 2. duel_matches
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'duel_matches' AND column_name = 'game_id'
  ) THEN
    ALTER TABLE duel_matches ADD COLUMN game_id TEXT NOT NULL DEFAULT 'dawen_rush';
  END IF;
END $$;

-- 3. game_results — game_id + extended stats
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_results' AND column_name = 'game_id'
  ) THEN
    ALTER TABLE game_results ADD COLUMN game_id TEXT NOT NULL DEFAULT 'dawen_rush';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'game_results' AND column_name = 'hits') THEN
    ALTER TABLE game_results ADD COLUMN hits INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'game_results' AND column_name = 'misses') THEN
    ALTER TABLE game_results ADD COLUMN misses INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'game_results' AND column_name = 'pairs_found') THEN
    ALTER TABLE game_results ADD COLUMN pairs_found INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'game_results' AND column_name = 'fragments_found') THEN
    ALTER TABLE game_results ADD COLUMN fragments_found INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'game_results' AND column_name = 'distance_units') THEN
    ALTER TABLE game_results ADD COLUMN distance_units INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'game_results' AND column_name = 'mistakes') THEN
    ALTER TABLE game_results ADD COLUMN mistakes INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'game_results' AND column_name = 'completion_time_ms') THEN
    ALTER TABLE game_results ADD COLUMN completion_time_ms INT DEFAULT 0;
  END IF;
END $$;

-- 4. Indexes for per-game queries
CREATE INDEX IF NOT EXISTS idx_duel_entries_game_id ON duel_entries(game_id);
CREATE INDEX IF NOT EXISTS idx_duel_matches_game_id ON duel_matches(game_id);
CREATE INDEX IF NOT EXISTS idx_game_results_game_id ON game_results(game_id);
CREATE INDEX IF NOT EXISTS idx_game_results_game_score ON game_results(game_id, score DESC);
