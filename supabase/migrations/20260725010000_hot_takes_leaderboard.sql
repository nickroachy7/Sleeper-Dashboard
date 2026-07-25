-- ── Global Hot-Takes leaderboard ────────────────────────────────────────────
-- Phase 2a (global): rank managers by how sharp their board is. Individual
-- boards (user_player_ratings) are public-read, but ranking EVERY user means
-- aggregating thousands of rows across all users — infeasible in the browser.
-- This SECURITY DEFINER function does it server-side and returns a small ranked
-- list of PUBLIC identity + aggregate stats only (no per-player opinion rows).
--
-- Two scores per manager:
--   • moved  — how many players they've pulled off consensus (conviction).
--   • called — how many of those leans the community LATER moved TOWARD (being
--              early — the real flex). A lean is "called" when the user's Elo
--              deviation and the player's 30-day community value move share a
--              sign, with thresholds matching the client useCalledIt hook.
--
-- Only profiles that have expressed real opinions appear. Ranked by called desc,
-- then moved desc. Capped so the payload stays small.

CREATE OR REPLACE FUNCTION hot_takes_leaderboard(p_limit INT DEFAULT 25)
RETURNS TABLE (
  username TEXT,
  avatar_url TEXT,
  moved BIGINT,
  called BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  -- Community value now vs ~30d ago, per player (latest row each side of the
  -- window). Mirrors the client's move computation.
  hist AS (
    SELECT DISTINCT ON (player_id) player_id, value AS val_now
    FROM player_value_history
    WHERE source = 'community'
    ORDER BY player_id, date DESC
  ),
  hist_past AS (
    SELECT DISTINCT ON (player_id) player_id, value AS val_past
    FROM player_value_history
    WHERE source = 'community' AND date <= (CURRENT_DATE - INTERVAL '30 days')
    ORDER BY player_id, date DESC
  ),
  move AS (
    SELECT h.player_id, (h.val_now - hp.val_past) AS crowd_move
    FROM hist h JOIN hist_past hp USING (player_id)
  ),
  -- Each user's leans (rating off the 1500 neutral), excluding picks.
  leans AS (
    SELECT r.user_id, r.player_id, (r.rating - 1500) AS lean
    FROM user_player_ratings r
    WHERE r.rating <> 1500 AND r.player_id NOT LIKE 'PICK:%'
  ),
  scored AS (
    SELECT
      l.user_id,
      count(*) FILTER (WHERE abs(l.lean) >= 24) AS moved,
      count(*) FILTER (
        WHERE abs(l.lean) >= 24
          AND m.crowd_move IS NOT NULL
          AND abs(m.crowd_move) >= 80
          AND sign(l.lean) = sign(m.crowd_move)
      ) AS called
    FROM leans l
    LEFT JOIN move m USING (player_id)
    GROUP BY l.user_id
  )
  SELECT p.username, p.avatar_url, s.moved, s.called
  FROM scored s
  JOIN profiles p ON p.user_id = s.user_id
  WHERE s.moved > 0
  ORDER BY s.called DESC, s.moved DESC
  LIMIT GREATEST(1, LEAST(p_limit, 100));
$$;

-- Returns only public identity + two integers per manager — safe to expose.
GRANT EXECUTE ON FUNCTION hot_takes_leaderboard(INT) TO anon, authenticated;
