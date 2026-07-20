-- ── Personal boards can hold draft picks ─────────────────────────────────────
-- Users want to rank rookie picks alongside players. The community engine
-- already ingests pick vote events ({pick:'YYYY-R'} sides) and rates picks by
-- year-round (community_pick_ratings, keyed 'YYYY-R'; Early/Mid/Late are just
-- display multipliers on top). This migration extends the PERSONAL board the
-- same way it already holds players.
--
-- Design: no schema change. user_player_ratings.player_id is TEXT with no FK,
-- so a pick lives as a sentinel id 'PICK:YYYY-R' (year-round — the same
-- granularity the community rates picks at, and the granularity a vote event
-- carries). Its baseline_value is the pick's Mid-tier community value (the
-- neutral center of the tier expansion). Player rows are untouched.
--
-- Safety: the profile board resolves each row through the players map and drops
-- rows with no player, so these pick rows are invisible in the UI until the
-- frontend explicitly renders picks — this migration causes no visible change.

-- ── 1. Baseline lookup for any board asset (player or pick sentinel) ──────────
-- Returns the community value that anchors a board row. Centralizes the
-- player-vs-pick branch so the seed and the vote trigger agree.
CREATE OR REPLACE FUNCTION board_asset_baseline(asset_key TEXT) RETURNS NUMERIC AS $$
DECLARE
  yr   TEXT;
  rnd  INT;
  v    NUMERIC;
BEGIN
  IF asset_key LIKE 'PICK:%' THEN
    -- 'PICK:2027-1' → year 2027, round 1. Mid tier is the canonical center.
    yr  := split_part(substring(asset_key FROM 6), '-', 1);
    rnd := split_part(substring(asset_key FROM 6), '-', 2)::INT;
    SELECT value INTO v FROM pick_values
      WHERE pick_year = yr AND pick_round = rnd AND pick_tier = 'Mid'
        AND source = 'community' AND superflex = TRUE
      LIMIT 1;
    RETURN v;
  ELSE
    SELECT value INTO v FROM player_values
      WHERE player_id = asset_key AND source = 'community' AND superflex = TRUE
      LIMIT 1;
    RETURN v;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- ── 2. Seed pick rows onto every existing profile's board ────────────────────
-- One row per year-round community pick, anchored to its Mid-tier value. Like
-- the player seed, a tiny descending de-tie offset keeps midpoints distinct so
-- edits land cleanly. ON CONFLICT only refreshes baseline_value, preserving any
-- pick rating a user already has.
INSERT INTO user_player_ratings (user_id, player_id, rating, wins, losses, baseline_value)
SELECT pr.user_id, k.asset_key, 1500, 0, 0, k.seed
FROM profiles pr
CROSS JOIN (
  SELECT
    'PICK:' || pick_year || '-' || pick_round AS asset_key,
    value - (row_number() OVER (ORDER BY value DESC, pick_year, pick_round) - 1) * 0.0001 AS seed
  FROM pick_values
  WHERE source = 'community' AND superflex = TRUE AND pick_tier = 'Mid'
) k
ON CONFLICT (user_id, player_id) DO UPDATE SET baseline_value = EXCLUDED.baseline_value;

-- ── 3. Seed picks for new accounts too ───────────────────────────────────────
-- Extend the sign-up seed so fresh boards include picks alongside players.
CREATE OR REPLACE FUNCTION seed_user_board() RETURNS trigger AS $$
BEGIN
  -- Players.
  INSERT INTO user_player_ratings (user_id, player_id, rating, wins, losses, baseline_value)
  SELECT
    NEW.user_id, player_id, 1500, 0, 0,
    value - (row_number() OVER (ORDER BY value DESC, player_id) - 1) * 0.0001
  FROM player_values
  WHERE source = 'community' AND superflex = TRUE
  ON CONFLICT (user_id, player_id) DO NOTHING;

  -- Picks (year-round, Mid-tier anchor).
  INSERT INTO user_player_ratings (user_id, player_id, rating, wins, losses, baseline_value)
  SELECT
    NEW.user_id, 'PICK:' || pick_year || '-' || pick_round, 1500, 0, 0,
    value - (row_number() OVER (ORDER BY value DESC, pick_year, pick_round) - 1) * 0.0001
  FROM pick_values
  WHERE source = 'community' AND superflex = TRUE AND pick_tier = 'Mid'
  ON CONFLICT (user_id, player_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. Generalize the vote trigger to players AND picks ──────────────────────
-- Resolve each side to a board asset key: a player id, or 'PICK:YYYY-R' for a
-- {pick:'YYYY-R'} side. Cross-asset votes (player vs pick) work naturally since
-- both live in the same player_id key space. Any row the vote creates freezes
-- its community baseline as of that moment (via board_asset_baseline).
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

  -- Player id, or the pick sentinel for a {pick:...} side.
  winner := COALESCE(
    NEW.side_a->0->>'player_id',
    CASE WHEN NEW.side_a->0->>'pick' IS NOT NULL THEN 'PICK:' || (NEW.side_a->0->>'pick') END
  );
  loser := COALESCE(
    NEW.side_b->0->>'player_id',
    CASE WHEN NEW.side_b->0->>'pick' IS NOT NULL THEN 'PICK:' || (NEW.side_b->0->>'pick') END
  );
  IF winner IS NULL OR loser IS NULL OR winner = loser THEN
    RETURN NEW;
  END IF;
  score := COALESCE(NEW.outcome, 1.0); -- 1 = side A preferred

  -- Create rows if missing, freezing each asset's current community value.
  INSERT INTO user_player_ratings (user_id, player_id, baseline_value)
  VALUES
    (NEW.user_id, winner, board_asset_baseline(winner)),
    (NEW.user_id, loser,  board_asset_baseline(loser))
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
