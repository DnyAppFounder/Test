/*
  # Fix Overall Leaderboard + Add Game Detail RPC

  1. Fixes
     - `get_overall_leaderboard`: rewrites in LANGUAGE sql to eliminate PL/pgSQL
       "ambiguous column" error where `wallet_address` in intermediate CTEs clashed
       with the RETURNS TABLE output variable of the same name.
       Uses `wa` as the internal CTE alias, aliased back to `wallet_address` in
       the final SELECT so the return type contract is unchanged.

  2. New Function
     - `get_game_detail_for_wallet(p_wallet text)`: returns per-game stats for a
       wallet aggregated from game_results. Used by the Games user detail modal to
       show Total Score / Best Score / Games Played / Best Combo per game, plus the
       overall duel record from game_leaderboard_scores.
*/

-- ─── Fix: get_overall_leaderboard (rewrite as LANGUAGE sql) ──────────────────

CREATE OR REPLACE FUNCTION get_overall_leaderboard(
  since_ts timestamptz DEFAULT NULL,
  lim      int          DEFAULT 50
) RETURNS TABLE (
  wallet_address       text,
  username             text,
  avatar_url           text,
  is_verified          boolean,
  is_premium           boolean,
  dawen_score          numeric,
  game_score_pts       numeric,
  pulse_score_pts      numeric,
  dworld_score_pts     numeric,
  community_score_pts  numeric,
  launchpad_score_pts  numeric
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $func$
  WITH
    -- Game contribution (all-time: from pre-aggregated table; timed: from raw results)
    game_pts AS (
      SELECT gls.wallet_address AS wa,
             (gls.best_score::numeric / 10 + gls.total_games * 2 + gls.duel_wins * 5) AS pts
      FROM   game_leaderboard_scores gls
      WHERE  since_ts IS NULL
        AND  (gls.best_score > 0 OR gls.total_games > 0)
      UNION ALL
      SELECT gr.wallet_address AS wa,
             (MAX(gr.score)::numeric / 10 + COUNT(gr.id) * 2) AS pts
      FROM   game_results gr
      WHERE  since_ts IS NOT NULL
        AND  gr.created_at >= since_ts
      GROUP  BY gr.wallet_address
    ),
    -- Pulse contribution
    pulse_pts AS (
      SELECT up.wallet_address AS wa,
             (  COALESCE(SUM(p.likes_count), 0)
              + COALESCE(COUNT(DISTINCT p.id), 0) * 3
              + COALESCE(fs.cnt, 0) * 5
             )::numeric AS pts
      FROM   user_profiles up
      LEFT JOIN posts p
             ON p.author_id = up.id
            AND (since_ts IS NULL OR p.created_at >= since_ts)
      LEFT JOIN (
        SELECT following_id, COUNT(*) AS cnt FROM follows GROUP BY following_id
      ) fs ON fs.following_id = up.id
      GROUP  BY up.wallet_address, fs.cnt
      HAVING COALESCE(COUNT(DISTINCT p.id), 0) > 0
          OR COALESCE(fs.cnt, 0) > 0
    ),
    -- DWORLD contribution
    dworld_pts AS (
      SELECT up.wallet_address AS wa,
             (SUM(ur.reward_amount)::numeric / 50) AS pts
      FROM   user_rewards ur
      JOIN   user_profiles up ON up.id = ur.user_id
      WHERE  ur.reward_token_mint = 'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump'
        AND  (since_ts IS NULL OR ur.created_at >= since_ts)
      GROUP  BY up.wallet_address
    ),
    -- Community contribution
    community_pts AS (
      SELECT up.wallet_address AS wa,
             (COALESCE(rs.cnt, 0) * 10 + COALESCE(fs.cnt, 0))::numeric AS pts
      FROM   user_profiles up
      LEFT JOIN (
        SELECT referrer_id, COUNT(*) AS cnt FROM referrals
        WHERE  since_ts IS NULL OR created_at >= since_ts
        GROUP  BY referrer_id
      ) rs ON rs.referrer_id = up.id
      LEFT JOIN (
        SELECT following_id, COUNT(*) AS cnt FROM follows GROUP BY following_id
      ) fs ON fs.following_id = up.id
      WHERE  COALESCE(rs.cnt, 0) > 0 OR COALESCE(fs.cnt, 0) > 0
    ),
    -- Launchpad contribution
    launchpad_pts AS (
      SELECT lt.creator_wallet AS wa,
             (COUNT(lt.id) * 20)::numeric AS pts
      FROM   launchpad_tokens lt
      WHERE  since_ts IS NULL OR lt.created_at >= since_ts
      GROUP  BY lt.creator_wallet
    ),
    -- Union of all wallets that have any activity
    all_wallets AS (
      SELECT wa FROM game_pts     WHERE pts > 0
      UNION
      SELECT wa FROM pulse_pts    WHERE pts > 0
      UNION
      SELECT wa FROM dworld_pts   WHERE pts > 0
      UNION
      SELECT wa FROM community_pts WHERE pts > 0
      UNION
      SELECT wa FROM launchpad_pts WHERE pts > 0
    )
  SELECT
    aw.wa                                                   AS wallet_address,
    up.username,
    up.avatar_url,
    COALESCE(up.is_verified, false)                         AS is_verified,
    COALESCE(up.is_premium, false)                          AS is_premium,
    (  COALESCE(gp.pts, 0) + COALESCE(pp.pts, 0)
     + COALESCE(dp.pts, 0) + COALESCE(cp.pts, 0)
     + COALESCE(lp.pts, 0)
    )                                                       AS dawen_score,
    COALESCE(gp.pts, 0)                                     AS game_score_pts,
    COALESCE(pp.pts, 0)                                     AS pulse_score_pts,
    COALESCE(dp.pts, 0)                                     AS dworld_score_pts,
    COALESCE(cp.pts, 0)                                     AS community_score_pts,
    COALESCE(lp.pts, 0)                                     AS launchpad_score_pts
  FROM   all_wallets aw
  LEFT JOIN user_profiles  up ON up.wallet_address = aw.wa
  LEFT JOIN game_pts        gp ON gp.wa = aw.wa
  LEFT JOIN pulse_pts       pp ON pp.wa = aw.wa
  LEFT JOIN dworld_pts      dp ON dp.wa = aw.wa
  LEFT JOIN community_pts   cp ON cp.wa = aw.wa
  LEFT JOIN launchpad_pts   lp ON lp.wa = aw.wa
  ORDER  BY dawen_score DESC
  LIMIT  lim
$func$;


-- ─── New: get_game_detail_for_wallet ─────────────────────────────────────────
-- Returns per-game aggregated stats for one wallet plus overall duel record.
-- Used by the Games user detail modal.

CREATE OR REPLACE FUNCTION get_game_detail_for_wallet(
  p_wallet text
) RETURNS TABLE (
  game_id          text,
  total_score      bigint,
  best_score       bigint,
  games_played     bigint,
  best_combo       bigint,
  total_survive_ms bigint,
  duel_wins        bigint,
  duel_losses      bigint,
  duel_total       bigint,
  total_sol_won    numeric
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $func$
  WITH per_game AS (
    SELECT
      gr.game_id,
      SUM(gr.score)::bigint            AS total_score,
      MAX(gr.score)::bigint            AS best_score,
      COUNT(gr.id)::bigint             AS games_played,
      MAX(gr.combo_max)::bigint        AS best_combo,
      SUM(gr.survival_time_ms)::bigint AS total_survive_ms
    FROM game_results gr
    WHERE gr.wallet_address = p_wallet
      AND gr.game_id IS NOT NULL
    GROUP BY gr.game_id
  ),
  duel_record AS (
    SELECT
      COALESCE(gls.duel_wins,   0)::bigint AS duel_wins,
      COALESCE(gls.duel_losses, 0)::bigint AS duel_losses,
      COALESCE(gls.duel_total,  0)::bigint AS duel_total,
      COALESCE(gls.total_sol_won, 0)       AS total_sol_won
    FROM game_leaderboard_scores gls
    WHERE gls.wallet_address = p_wallet
    LIMIT 1
  )
  SELECT
    pg.game_id,
    pg.total_score,
    pg.best_score,
    pg.games_played,
    pg.best_combo,
    pg.total_survive_ms,
    COALESCE(dr.duel_wins,    0)::bigint AS duel_wins,
    COALESCE(dr.duel_losses,  0)::bigint AS duel_losses,
    COALESCE(dr.duel_total,   0)::bigint AS duel_total,
    COALESCE(dr.total_sol_won, 0)        AS total_sol_won
  FROM per_game pg
  CROSS JOIN LATERAL (SELECT * FROM duel_record) dr
  ORDER BY pg.total_score DESC
$func$;
