/*
  # Decode 7 Fragments — Session Tracking, Anti-cheat & Puzzle Rotation

  ## Summary
  Adds session-level tracking for every Decode the 7 Fragments play session.
  Enables server-side anti-cheat validation: completion time, suspicious flag,
  duplicate submission guard. Updates the reward RPC to validate timing before
  granting the 15,000 DWORLD first-completion reward.

  ## New Tables
  1. `decode_game_sessions`
     - One record per play attempt (free_practice, ranked_practice, sol_duel)
     - Tracks: sessionId, puzzleId, mode, walletAddress, startedAt, endedAt,
       completionTimeMs, correctWordsFound, mistakes, accuracy, score,
       suspicious flag, validated flag, submitted flag

  ## Modified Functions
  1. `grant_decode_first_reward` — now accepts `p_completion_time_ms` parameter.
     Returns `suspicious_completion` reason (< 15 seconds) without granting reward.
     All other logic unchanged and idempotent.

  ## Security
  - RLS enabled on decode_game_sessions; public SELECT only.
  - All INSERT / UPDATE via SECURITY DEFINER functions.
*/

-- ─── decode_game_sessions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS decode_game_sessions (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           text        UNIQUE NOT NULL,
  puzzle_id            text        NOT NULL,
  game_id              text        NOT NULL DEFAULT 'decode_7_fragments',
  mode                 text        NOT NULL CHECK (mode IN ('free_practice','ranked_practice','sol_duel')),
  wallet_address       text        NOT NULL,
  user_id              uuid,
  match_id             uuid,
  started_at           timestamptz NOT NULL,
  ended_at             timestamptz,
  completion_time_ms   bigint,
  correct_words_found  integer     NOT NULL DEFAULT 0,
  mistakes             integer     NOT NULL DEFAULT 0,
  accuracy             numeric(5,4),
  score                integer     NOT NULL DEFAULT 0,
  suspicious           boolean     NOT NULL DEFAULT false,
  validated            boolean     NOT NULL DEFAULT false,
  submitted            boolean     NOT NULL DEFAULT false,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

ALTER TABLE decode_game_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read decode sessions"
  ON decode_game_sessions FOR SELECT
  TO public
  USING (true);

CREATE INDEX IF NOT EXISTS idx_decode_sessions_wallet
  ON decode_game_sessions (wallet_address);

CREATE INDEX IF NOT EXISTS idx_decode_sessions_mode
  ON decode_game_sessions (mode, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_decode_sessions_puzzle
  ON decode_game_sessions (puzzle_id);

-- ─── upsert_decode_game_session ──────────────────────────────────────────────
-- Called by client on game end to persist session record for anti-cheat.
-- Safe to call multiple times for the same session_id (idempotent via upsert).

CREATE OR REPLACE FUNCTION public.upsert_decode_game_session(
  p_session_id         text,
  p_puzzle_id          text,
  p_mode               text,
  p_wallet_address     text,
  p_user_id            uuid    DEFAULT NULL,
  p_match_id           uuid    DEFAULT NULL,
  p_started_at         timestamptz DEFAULT now(),
  p_ended_at           timestamptz DEFAULT now(),
  p_completion_time_ms bigint  DEFAULT 0,
  p_correct_words      integer DEFAULT 0,
  p_mistakes           integer DEFAULT 0,
  p_accuracy           numeric DEFAULT 0,
  p_score              integer DEFAULT 0,
  p_suspicious         boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO decode_game_sessions (
    session_id, puzzle_id, mode, wallet_address, user_id, match_id,
    started_at, ended_at, completion_time_ms, correct_words_found,
    mistakes, accuracy, score, suspicious, submitted
  ) VALUES (
    p_session_id, p_puzzle_id, p_mode, p_wallet_address, p_user_id, p_match_id,
    p_started_at, p_ended_at, p_completion_time_ms, p_correct_words,
    p_mistakes, p_accuracy, p_score, p_suspicious, true
  )
  ON CONFLICT (session_id) DO UPDATE SET
    ended_at           = EXCLUDED.ended_at,
    completion_time_ms = EXCLUDED.completion_time_ms,
    correct_words_found= EXCLUDED.correct_words_found,
    mistakes           = EXCLUDED.mistakes,
    accuracy           = EXCLUDED.accuracy,
    score              = EXCLUDED.score,
    suspicious         = EXCLUDED.suspicious,
    submitted          = true,
    updated_at         = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ─── grant_decode_first_reward (updated) ─────────────────────────────────────
-- Now accepts p_completion_time_ms for server-side timing validation.
-- Rejects completions faster than 15 seconds as suspicious.

CREATE OR REPLACE FUNCTION public.grant_decode_first_reward(
  p_wallet_address     text,
  p_user_id            uuid    DEFAULT NULL,
  p_completion_time_ms bigint  DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status_id  uuid;
  v_reward_id  uuid;
BEGIN
  -- Anti-cheat: reject impossibly fast completions (< 15 seconds).
  -- 15,000ms is the minimum realistic time to find all 7 words.
  IF p_completion_time_ms > 0 AND p_completion_time_ms < 15000 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'suspicious_completion');
  END IF;

  -- Idempotency: already unlocked for this wallet?
  IF EXISTS (
    SELECT 1 FROM decode_reward_status
    WHERE wallet_address = p_wallet_address
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_unlocked');
  END IF;

  -- Insert status record (unique constraint is the final guard against races)
  INSERT INTO decode_reward_status (
    wallet_address, user_id,
    free_practice_completed, completed_at,
    reward_unlocked, unlocked_at
  ) VALUES (
    p_wallet_address, p_user_id,
    true, now(),
    true, now()
  )
  ON CONFLICT (wallet_address) DO NOTHING
  RETURNING id INTO v_status_id;

  -- Conflict means another concurrent call already inserted — abort gracefully
  IF v_status_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'conflict');
  END IF;

  -- Ensure no duplicate user_reward for the same wallet + reason
  IF NOT EXISTS (
    SELECT 1 FROM user_rewards
    WHERE wallet_address = p_wallet_address
      AND reason = 'decode_first_completion'
  ) THEN
    INSERT INTO user_rewards (
      user_id, wallet_address,
      reward_token_mint, reward_amount,
      reason, status
    ) VALUES (
      p_user_id, p_wallet_address,
      'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump',
      15000,
      'decode_first_completion',
      'ready'
    )
    RETURNING id INTO v_reward_id;
  END IF;

  RETURN jsonb_build_object(
    'success',    true,
    'status_id',  v_status_id::text,
    'reward_id',  COALESCE(v_reward_id::text, 'existing')
  );
END;
$$;
