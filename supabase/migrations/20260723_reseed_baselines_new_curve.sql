-- ── Re-seed personal-board baselines to the new value curve ──────────────────
-- The community value curve was resteepened (two-segment: elites tower, deep
-- players stay spread) and recomputed. Existing user_player_ratings rows still
-- carry baseline_value frozen under the OLD flat curve, so personal boards
-- would mix old-curve baselines with new-curve community values. This refreshes
-- every existing row's baseline_value from the CURRENT community values so
-- boards match the new curve.
--
-- What's preserved: each user's `rating` (their votes/edits) is untouched — only
-- the anchor moves. Their ranking ORDER is defined by blended = baseline +
-- (rating-1500)*ELO; re-anchoring shifts absolute values to the new curve while
-- their expressed opinions (deviations from the crowd) carry over intact.
--
-- De-tie: like the original seed, bake a tiny descending offset (by community
-- value, then id) into baseline_value so no two anchors collide — every midpoint
-- stays distinct and drag / ▲▼ / set-exact-rank keep landing. The offset is
-- fractions of a point on a 0–9999 scale, below display rounding.

-- Players: refresh from the current community player_values (SF).
WITH ranked AS (
  SELECT
    player_id,
    value - (row_number() OVER (ORDER BY value DESC, player_id) - 1) * 0.0001 AS seed
  FROM player_values
  WHERE source = 'community' AND superflex = TRUE
)
UPDATE user_player_ratings u
SET baseline_value = r.seed
FROM ranked r
WHERE u.player_id = r.player_id;

-- Picks: refresh from the current Mid-tier community pick_values.
WITH ranked AS (
  SELECT
    'PICK:' || pick_year || '-' || pick_round AS asset_key,
    value - (row_number() OVER (ORDER BY value DESC, pick_year, pick_round) - 1) * 0.0001 AS seed
  FROM pick_values
  WHERE source = 'community' AND superflex = TRUE AND pick_tier = 'Mid'
)
UPDATE user_player_ratings u
SET baseline_value = r.seed
FROM ranked r
WHERE u.player_id = r.asset_key;
