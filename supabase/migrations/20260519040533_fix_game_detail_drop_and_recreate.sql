/*
  # Replace get_game_detail_for_wallet — clean per-game aggregates only

  Drops the previous version that had extra duel columns via CROSS JOIN (which
  caused type conflicts) and recreates with a minimal, correct signature.
*/

DROP FUNCTION IF EXISTS get_game_detail_for_wallet(text);

CREATE OR REPLACE FUNCTION get_game_detail_for_wallet(
  p_wallet text
) RETURNS TABLE (
  game_id          text,
  total_score      bigint,
  best_score       bigint,
  games_played     bigint,
  best_combo       bigint,
  total_survive_ms bigint
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $func$
  SELECT
    gr.game_id,
    SUM(gr.score)::bigint                         AS total_score,
    MAX(gr.score)::bigint                         AS best_score,
    COUNT(gr.id)::bigint                          AS games_played,
    MAX(gr.combo_max)::bigint                     AS best_combo,
    SUM(COALESCE(gr.survival_time_ms, 0))::bigint AS total_survive_ms
  FROM   game_results gr
  WHERE  gr.wallet_address = p_wallet
    AND  gr.game_id IS NOT NULL
  GROUP  BY gr.game_id
  ORDER  BY SUM(gr.score) DESC
$func$;
