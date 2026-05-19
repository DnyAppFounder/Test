/*
  # Leaderboard RPC Functions for DAWEN City Top Rank

  Creates 6 SECURITY DEFINER functions to power the ecosystem leaderboard.
  SECURITY DEFINER ensures consistent read access across all tables regardless
  of RLS policies (needed for aggregating restricted tables like user_rewards).

  ## Functions

  1. `get_games_leaderboard(since_ts, lim)` — game scores from game_leaderboard_scores / game_results
  2. `get_pulse_leaderboard(since_ts, lim)` — pulse/social activity from posts, follows
  3. `get_dworld_leaderboard(since_ts, lim)` — DWORLD rewards from user_rewards
  4. `get_community_leaderboard(since_ts, lim)` — referrals + followers from referrals, follows
  5. `get_launchpad_leaderboard(since_ts, lim)` — creator launches from launchpad_tokens
  6. `get_overall_leaderboard(since_ts, lim)` — composite DAWEN Score from all categories

  ## Score Formula (Overall)
  dawen_score = (best_score/10 + games*2 + wins*5) + (posts*3 + likes + followers*5)
              + (dworld_earned/50) + (referrals*10) + (launches*20)

  ## Parameters
  - since_ts: NULL = all time; ISO timestamp = results since that time
  - lim: max rows to return (default 50)
*/

-- ─── 1. Games Leaderboard ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_games_leaderboard(
  since_ts timestamptz DEFAULT NULL,
  lim int DEFAULT 50
) RETURNS TABLE (
  wallet_address  text,
  username        text,
  avatar_url      text,
  is_verified     boolean,
  is_premium      boolean,
  best_score      bigint,
  best_combo      bigint,
  total_games     bigint,
  duel_wins       bigint,
  duel_total      bigint,
  total_sol_won   numeric,
  win_rate        numeric,
  game_score_pts  numeric
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF since_ts IS NULL THEN
    RETURN QUERY
    SELECT
      gls.wallet_address,
      COALESCE(up.username, gls.username)                   AS username,
      COALESCE(up.avatar_url, gls.avatar_url)               AS avatar_url,
      COALESCE(up.is_verified, false)                       AS is_verified,
      COALESCE(up.is_premium, false)                        AS is_premium,
      gls.best_score::bigint,
      gls.best_combo::bigint,
      gls.total_games::bigint,
      gls.duel_wins::bigint,
      gls.duel_total::bigint,
      gls.total_sol_won,
      gls.win_rate,
      (gls.best_score::numeric / 10 + gls.total_games * 2 + gls.duel_wins * 5) AS game_score_pts
    FROM game_leaderboard_scores gls
    LEFT JOIN user_profiles up ON up.wallet_address = gls.wallet_address
    WHERE gls.best_score > 0 OR gls.total_games > 0
    ORDER BY gls.best_score DESC
    LIMIT lim;
  ELSE
    RETURN QUERY
    SELECT
      gr.wallet_address,
      COALESCE(up.username, gls.username)                   AS username,
      COALESCE(up.avatar_url, gls.avatar_url)               AS avatar_url,
      COALESCE(up.is_verified, false)                       AS is_verified,
      COALESCE(up.is_premium, false)                        AS is_premium,
      MAX(gr.score)::bigint                                 AS best_score,
      MAX(gr.combo_max)::bigint                             AS best_combo,
      COUNT(gr.id)::bigint                                  AS total_games,
      COALESCE(MAX(gls.duel_wins), 0)::bigint               AS duel_wins,
      COALESCE(MAX(gls.duel_total), 0)::bigint              AS duel_total,
      COALESCE(MAX(gls.total_sol_won), 0)                   AS total_sol_won,
      COALESCE(MAX(gls.win_rate), 0)                        AS win_rate,
      (MAX(gr.score)::numeric / 10 + COUNT(gr.id) * 2)     AS game_score_pts
    FROM game_results gr
    LEFT JOIN game_leaderboard_scores gls ON gls.wallet_address = gr.wallet_address
    LEFT JOIN user_profiles up ON up.wallet_address = gr.wallet_address
    WHERE gr.created_at >= since_ts
    GROUP BY gr.wallet_address, up.username, gls.username, up.avatar_url, gls.avatar_url,
             up.is_verified, up.is_premium
    ORDER BY MAX(gr.score) DESC
    LIMIT lim;
  END IF;
END;
$$;

-- ─── 2. Pulse Leaderboard ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_pulse_leaderboard(
  since_ts timestamptz DEFAULT NULL,
  lim int DEFAULT 50
) RETURNS TABLE (
  wallet_address           text,
  username                 text,
  avatar_url               text,
  is_verified              boolean,
  is_premium               boolean,
  post_count               bigint,
  total_likes_received     bigint,
  total_comments_received  bigint,
  total_reposts_received   bigint,
  follower_count           bigint,
  pulse_score_pts          numeric
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH post_stats AS (
    SELECT
      p.author_id,
      COUNT(DISTINCT p.id)                          AS post_count,
      SUM(COALESCE(p.likes_count, 0))               AS total_likes,
      SUM(COALESCE(p.comments_count, 0))            AS total_comments,
      SUM(COALESCE(p.reposts_count, 0))             AS total_reposts
    FROM posts p
    WHERE since_ts IS NULL OR p.created_at >= since_ts
    GROUP BY p.author_id
  ),
  follower_stats AS (
    SELECT following_id AS user_id, COUNT(*) AS cnt
    FROM follows
    GROUP BY following_id
  )
  SELECT
    up.wallet_address,
    up.username,
    up.avatar_url,
    COALESCE(up.is_verified, false)                             AS is_verified,
    COALESCE(up.is_premium, false)                              AS is_premium,
    COALESCE(ps.post_count, 0)::bigint                          AS post_count,
    COALESCE(ps.total_likes, 0)::bigint                         AS total_likes_received,
    COALESCE(ps.total_comments, 0)::bigint                      AS total_comments_received,
    COALESCE(ps.total_reposts, 0)::bigint                       AS total_reposts_received,
    COALESCE(fs.cnt, 0)::bigint                                 AS follower_count,
    (COALESCE(ps.post_count, 0) * 3
     + COALESCE(ps.total_likes, 0)
     + COALESCE(fs.cnt, 0) * 5)::numeric                       AS pulse_score_pts
  FROM user_profiles up
  LEFT JOIN post_stats ps ON ps.author_id = up.id
  LEFT JOIN follower_stats fs ON fs.user_id = up.id
  WHERE COALESCE(ps.post_count, 0) > 0 OR COALESCE(fs.cnt, 0) > 0
  ORDER BY pulse_score_pts DESC
  LIMIT lim;
END;
$$;

-- ─── 3. DWORLD Leaderboard ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_dworld_leaderboard(
  since_ts timestamptz DEFAULT NULL,
  lim int DEFAULT 50
) RETURNS TABLE (
  wallet_address   text,
  username         text,
  avatar_url       text,
  is_verified      boolean,
  is_premium       boolean,
  total_earned     bigint,
  total_claimed    bigint,
  total_pending    bigint,
  dworld_score_pts numeric
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    up.wallet_address,
    up.username,
    up.avatar_url,
    COALESCE(up.is_verified, false)                                                AS is_verified,
    COALESCE(up.is_premium, false)                                                 AS is_premium,
    SUM(ur.reward_amount)::bigint                                                  AS total_earned,
    SUM(CASE WHEN ur.status IN ('sent','claiming') THEN ur.reward_amount ELSE 0 END)::bigint AS total_claimed,
    SUM(CASE WHEN ur.status = 'ready' THEN ur.reward_amount ELSE 0 END)::bigint   AS total_pending,
    (SUM(ur.reward_amount)::numeric / 50)                                          AS dworld_score_pts
  FROM user_rewards ur
  JOIN user_profiles up ON up.id = ur.user_id
  WHERE ur.reward_token_mint = 'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump'
    AND (since_ts IS NULL OR ur.created_at >= since_ts)
  GROUP BY up.id, up.wallet_address, up.username, up.avatar_url, up.is_verified, up.is_premium
  ORDER BY total_earned DESC
  LIMIT lim;
END;
$$;

-- ─── 4. Community Leaderboard ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_community_leaderboard(
  since_ts timestamptz DEFAULT NULL,
  lim int DEFAULT 50
) RETURNS TABLE (
  wallet_address       text,
  username             text,
  avatar_url           text,
  is_verified          boolean,
  is_premium           boolean,
  referral_count       bigint,
  follower_count       bigint,
  community_score_pts  numeric
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH ref_stats AS (
    SELECT
      r.referrer_id AS user_id,
      COUNT(r.id)::bigint AS cnt
    FROM referrals r
    WHERE since_ts IS NULL OR r.created_at >= since_ts
    GROUP BY r.referrer_id
  ),
  follower_stats AS (
    SELECT following_id AS user_id, COUNT(*) AS cnt
    FROM follows
    GROUP BY following_id
  )
  SELECT
    up.wallet_address,
    up.username,
    up.avatar_url,
    COALESCE(up.is_verified, false)                                   AS is_verified,
    COALESCE(up.is_premium, false)                                    AS is_premium,
    COALESCE(rs.cnt, 0)::bigint                                       AS referral_count,
    COALESCE(fs.cnt, 0)::bigint                                       AS follower_count,
    (COALESCE(rs.cnt, 0) * 10 + COALESCE(fs.cnt, 0))::numeric        AS community_score_pts
  FROM user_profiles up
  LEFT JOIN ref_stats rs ON rs.user_id = up.id
  LEFT JOIN follower_stats fs ON fs.user_id = up.id
  WHERE COALESCE(rs.cnt, 0) > 0 OR COALESCE(fs.cnt, 0) > 0
  ORDER BY community_score_pts DESC
  LIMIT lim;
END;
$$;

-- ─── 5. Launchpad Leaderboard ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_launchpad_leaderboard(
  since_ts timestamptz DEFAULT NULL,
  lim int DEFAULT 50
) RETURNS TABLE (
  wallet_address        text,
  username              text,
  avatar_url            text,
  is_verified           boolean,
  is_premium            boolean,
  total_launches        bigint,
  successful_launches   bigint,
  launchpad_score_pts   numeric
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    lt.creator_wallet                                             AS wallet_address,
    COALESCE(up.username)                                         AS username,
    COALESCE(up.avatar_url)                                       AS avatar_url,
    COALESCE(up.is_verified, false)                               AS is_verified,
    COALESCE(up.is_premium, false)                                AS is_premium,
    COUNT(lt.id)::bigint                                          AS total_launches,
    COUNT(CASE WHEN lt.status = 'deployed' THEN 1 END)::bigint   AS successful_launches,
    (COUNT(lt.id) * 20)::numeric                                  AS launchpad_score_pts
  FROM launchpad_tokens lt
  LEFT JOIN user_profiles up ON up.wallet_address = lt.creator_wallet
  WHERE since_ts IS NULL OR lt.created_at >= since_ts
  GROUP BY lt.creator_wallet, up.username, up.avatar_url, up.is_verified, up.is_premium
  ORDER BY total_launches DESC
  LIMIT lim;
END;
$$;

-- ─── 6. Overall Leaderboard (composite DAWEN Score) ──────────────────────────

CREATE OR REPLACE FUNCTION get_overall_leaderboard(
  since_ts timestamptz DEFAULT NULL,
  lim int DEFAULT 50
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
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH
    -- Game contribution: from pre-aggregated table (all time) or game_results (timed)
    game_pts AS (
      SELECT
        gls.wallet_address,
        (gls.best_score::numeric / 10 + gls.total_games * 2 + gls.duel_wins * 5) AS pts
      FROM game_leaderboard_scores gls
      WHERE since_ts IS NULL AND (gls.best_score > 0 OR gls.total_games > 0)
      UNION ALL
      SELECT
        gr.wallet_address,
        (MAX(gr.score)::numeric / 10 + COUNT(gr.id) * 2) AS pts
      FROM game_results gr
      WHERE since_ts IS NOT NULL AND gr.created_at >= since_ts
      GROUP BY gr.wallet_address
    ),
    -- Pulse contribution
    pulse_pts AS (
      SELECT
        up.wallet_address,
        (COALESCE(SUM(p.likes_count), 0)
         + COALESCE(COUNT(DISTINCT p.id), 0) * 3
         + COALESCE(fs.cnt, 0) * 5)::numeric AS pts
      FROM user_profiles up
      LEFT JOIN posts p ON p.author_id = up.id
        AND (since_ts IS NULL OR p.created_at >= since_ts)
      LEFT JOIN (
        SELECT following_id, COUNT(*) AS cnt FROM follows GROUP BY following_id
      ) fs ON fs.following_id = up.id
      GROUP BY up.wallet_address, fs.cnt
      HAVING COALESCE(COUNT(DISTINCT p.id), 0) > 0 OR COALESCE(fs.cnt, 0) > 0
    ),
    -- DWORLD contribution
    dworld_pts AS (
      SELECT
        up.wallet_address,
        (SUM(ur.reward_amount)::numeric / 50) AS pts
      FROM user_rewards ur
      JOIN user_profiles up ON up.id = ur.user_id
      WHERE ur.reward_token_mint = 'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump'
        AND (since_ts IS NULL OR ur.created_at >= since_ts)
      GROUP BY up.wallet_address
    ),
    -- Community contribution
    community_pts AS (
      SELECT
        up.wallet_address,
        (COALESCE(rs.cnt, 0) * 10 + COALESCE(fs.cnt, 0))::numeric AS pts
      FROM user_profiles up
      LEFT JOIN (
        SELECT referrer_id, COUNT(*) AS cnt FROM referrals
        WHERE (since_ts IS NULL OR created_at >= since_ts)
        GROUP BY referrer_id
      ) rs ON rs.referrer_id = up.id
      LEFT JOIN (
        SELECT following_id, COUNT(*) AS cnt FROM follows GROUP BY following_id
      ) fs ON fs.following_id = up.id
      WHERE COALESCE(rs.cnt, 0) > 0 OR COALESCE(fs.cnt, 0) > 0
    ),
    -- Launchpad contribution
    launchpad_pts AS (
      SELECT
        lt.creator_wallet AS wallet_address,
        (COUNT(lt.id) * 20)::numeric AS pts
      FROM launchpad_tokens lt
      WHERE since_ts IS NULL OR lt.created_at >= since_ts
      GROUP BY lt.creator_wallet
    ),
    -- Union of all active wallets
    all_wallets AS (
      SELECT wallet_address FROM game_pts     WHERE pts > 0
      UNION SELECT wallet_address FROM pulse_pts      WHERE pts > 0
      UNION SELECT wallet_address FROM dworld_pts     WHERE pts > 0
      UNION SELECT wallet_address FROM community_pts  WHERE pts > 0
      UNION SELECT wallet_address FROM launchpad_pts  WHERE pts > 0
    )
  SELECT
    aw.wallet_address,
    COALESCE(up.username)                                   AS username,
    COALESCE(up.avatar_url)                                 AS avatar_url,
    COALESCE(up.is_verified, false)                         AS is_verified,
    COALESCE(up.is_premium, false)                          AS is_premium,
    (
      COALESCE(gp.pts, 0) + COALESCE(pp.pts, 0) +
      COALESCE(dp.pts, 0) + COALESCE(cp.pts, 0) +
      COALESCE(lp.pts, 0)
    )                                                       AS dawen_score,
    COALESCE(gp.pts, 0)                                     AS game_score_pts,
    COALESCE(pp.pts, 0)                                     AS pulse_score_pts,
    COALESCE(dp.pts, 0)                                     AS dworld_score_pts,
    COALESCE(cp.pts, 0)                                     AS community_score_pts,
    COALESCE(lp.pts, 0)                                     AS launchpad_score_pts
  FROM all_wallets aw
  LEFT JOIN user_profiles up ON up.wallet_address = aw.wallet_address
  LEFT JOIN game_pts      gp ON gp.wallet_address = aw.wallet_address
  LEFT JOIN pulse_pts     pp ON pp.wallet_address = aw.wallet_address
  LEFT JOIN dworld_pts    dp ON dp.wallet_address = aw.wallet_address
  LEFT JOIN community_pts cp ON cp.wallet_address = aw.wallet_address
  LEFT JOIN launchpad_pts lp ON lp.wallet_address = aw.wallet_address
  ORDER BY dawen_score DESC
  LIMIT lim;
END;
$$;
