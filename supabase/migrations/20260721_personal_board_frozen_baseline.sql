-- ── Personal boards stand on their own (frozen community baseline) ───────────
-- Bug: a user's /u/<name> board visibly drifted when OTHER users voted, even on
-- players they never touched. Their own ratings were never modified (RLS +
-- the per-voter trigger guarantee that) — the drift came from the READ side.
-- The board was drawn as `liveCommunityValue + (rating-1500)*ELO`, and untouched
-- players (no personal row) were pinned to the LIVE community value, which the
-- community recompute moves every cycle.
--
-- New model (what a "personal board" should be): seed each board ONCE from the
-- community as a starting point, then it is the user's alone — only their votes
-- and manual edits move it. We freeze the community value into a per-row
-- `baseline_value` at seed time and blend against THAT, never the live value.
-- Because we seed from the CURRENT community values, every existing board looks
-- identical the moment after this runs — no visible jump — but from now on it
-- is fully insulated from everyone else's activity.

-- ── 1. The frozen anchor ─────────────────────────────────────────────────────
-- The community value captured when this (user, player) row was seeded. The
-- board is drawn as baseline_value + (rating-1500)*ELO_SCALE. Nullable so a
-- vote can never hard-fail on a missing baseline; always populated in practice
-- (backfill below + both write paths set it).
ALTER TABLE user_player_ratings ADD COLUMN IF NOT EXISTS baseline_value NUMERIC;

-- ── 2. Materialize a full, frozen board for every existing profile ───────────
-- Until now boards were sparse (only voted players had rows); untouched players
-- were drawn live, which is exactly the drift. Give every profile a row per
-- community-valued player so the board is a self-contained, static thing.
--
-- baseline_value bakes in a tiny descending de-tie offset (community values tie
-- heavily at the tail — ~110 players share value 1). This keeps every midpoint
-- distinct so drag / set-exact-rank always land, and makes the frozen order
-- deterministic. The offset is fractions of a point on a 0–9999 scale, well
-- below display rounding, so nothing user-visible shifts.
--
-- ON CONFLICT touches ONLY baseline_value: already-voted rows keep their
-- rating/wins/losses untouched, so a user's existing takes survive verbatim.
INSERT INTO user_player_ratings (user_id, player_id, rating, wins, losses, baseline_value)
SELECT pr.user_id, v.player_id, 1500, 0, 0, v.seed
FROM profiles pr
CROSS JOIN (
  SELECT
    player_id,
    value - (row_number() OVER (ORDER BY value DESC, player_id) - 1) * 0.0001 AS seed
  FROM player_values
  WHERE source = 'community' AND superflex = TRUE
) v
ON CONFLICT (user_id, player_id) DO UPDATE SET baseline_value = EXCLUDED.baseline_value;

-- ── 3. Seed a fresh board on sign-up ─────────────────────────────────────────
-- New accounts get the same one-time community snapshot the instant their
-- public profile is created (profiles rows are inserted client-side at sign-up).
-- SECURITY DEFINER to bypass RLS; DO NOTHING so it never clobbers a row.
CREATE OR REPLACE FUNCTION seed_user_board() RETURNS trigger AS $$
BEGIN
  INSERT INTO user_player_ratings (user_id, player_id, rating, wins, losses, baseline_value)
  SELECT
    NEW.user_id,
    player_id,
    1500, 0, 0,
    value - (row_number() OVER (ORDER BY value DESC, player_id) - 1) * 0.0001
  FROM player_values
  WHERE source = 'community' AND superflex = TRUE
  ON CONFLICT (user_id, player_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_seed_user_board ON profiles;
CREATE TRIGGER trg_seed_user_board
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION seed_user_board();

-- ── 4. Votes keep the frozen anchor ──────────────────────────────────────────
-- Rebuild the per-vote Elo trigger so that if a vote ever creates a brand-new
-- (user, player) row — e.g. a player added to the community AFTER the board was
-- seeded — that row freezes the community value AS OF that moment. Existing
-- rows are left alone (DO NOTHING), so their seed anchor never moves. The Elo
-- math is unchanged; only the INSERT now carries baseline_value.
CREATE OR REPLACE FUNCTION apply_personal_rating() RETURNS trigger AS $$
DECLARE
  k CONSTANT NUMERIC := 32;
  winner TEXT;
  loser  TEXT;
  r_w NUMERIC;
  r_l NUMERIC;
  exp_w NUMERIC;
  score NUMERIC;
BEGIN
  IF NEW.user_id IS NULL OR NEW.kind <> 'pairwise' THEN
    RETURN NEW;
  END IF;
  IF jsonb_array_length(NEW.side_a) <> 1 OR jsonb_array_length(NEW.side_b) <> 1 THEN
    RETURN NEW;
  END IF;

  winner := NEW.side_a->0->>'player_id';
  loser  := NEW.side_b->0->>'player_id';
  IF winner IS NULL OR loser IS NULL OR winner = loser THEN
    RETURN NEW;
  END IF;
  score := COALESCE(NEW.outcome, 1.0); -- 1 = side A preferred

  -- Create rows if missing, freezing the current community value as the anchor.
  -- Existing rows keep their seeded baseline (DO NOTHING).
  INSERT INTO user_player_ratings (user_id, player_id, baseline_value)
  VALUES
    (NEW.user_id, winner,
      (SELECT value FROM player_values WHERE player_id = winner AND source = 'community' AND superflex = TRUE)),
    (NEW.user_id, loser,
      (SELECT value FROM player_values WHERE player_id = loser  AND source = 'community' AND superflex = TRUE))
  ON CONFLICT (user_id, player_id) DO NOTHING;

  SELECT rating INTO r_w FROM user_player_ratings WHERE user_id = NEW.user_id AND player_id = winner;
  SELECT rating INTO r_l FROM user_player_ratings WHERE user_id = NEW.user_id AND player_id = loser;
  exp_w := 1 / (1 + power(10, (r_l - r_w) / 400));

  UPDATE user_player_ratings
    SET rating = r_w + k * (score - exp_w),
        wins = wins + CASE WHEN score >= 0.5 THEN 1 ELSE 0 END,
        losses = losses + CASE WHEN score < 0.5 THEN 1 ELSE 0 END,
        updated_at = NOW()
    WHERE user_id = NEW.user_id AND player_id = winner;

  UPDATE user_player_ratings
    SET rating = r_l + k * (exp_w - score),
        wins = wins + CASE WHEN score < 0.5 THEN 1 ELSE 0 END,
        losses = losses + CASE WHEN score >= 0.5 THEN 1 ELSE 0 END,
        updated_at = NOW()
    WHERE user_id = NEW.user_id AND player_id = loser;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
