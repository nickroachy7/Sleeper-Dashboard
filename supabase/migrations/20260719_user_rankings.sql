-- ── User profiles + personal player rankings ────────────────────────────────
-- Accounts get a public face: /u/<username> shows a live leaderboard of the
-- user's OWN player rankings, built from their votes. Every pairwise vote a
-- signed-in user casts updates their personal Elo board via trigger — the
-- community Glicko engine is untouched (votes still feed it exactly as
-- before; personal ratings are a parallel, per-user view).

-- ── 1. Public profiles ──────────────────────────────────────────────────────
-- auth.users isn't publicly readable, so the shareable page needs a public
-- projection: username → identity. Rows are created client-side at sign-up.
CREATE TABLE IF NOT EXISTS profiles (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username   TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_]{3,20}$')
);

-- Case-insensitive uniqueness: "Nick" and "nick" are the same handle.
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_username_ci ON profiles (lower(username));

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select ON profiles FOR SELECT USING (true);
CREATE POLICY profiles_insert ON profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY profiles_update ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 2. Attribute votes to accounts ──────────────────────────────────────────
-- voter_id stays (anonymous abuse control); user_id is the real attribution.
ALTER TABLE value_events ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_value_events_user ON value_events (user_id) WHERE user_id IS NOT NULL;

-- Rebuild the insert policy: clients may only stamp their OWN user id (or none).
DROP POLICY IF EXISTS value_events_insert_votes ON value_events;
CREATE POLICY value_events_insert_votes ON value_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    kind IN ('pairwise', 'calculator')
    AND weight <= 1.5
    AND source_ref IS NULL
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- ── 3. Personal rating board ────────────────────────────────────────────────
-- One row per (user, player). Written ONLY by the trigger below (SECURITY
-- DEFINER) — no client write policies, so a user can't forge a board.
CREATE TABLE IF NOT EXISTS user_player_ratings (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_id  TEXT NOT NULL,
  rating     NUMERIC NOT NULL DEFAULT 1500,
  wins       INT NOT NULL DEFAULT 0,
  losses     INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_user_player_ratings_board
  ON user_player_ratings (user_id, rating DESC);

ALTER TABLE user_player_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_player_ratings_select ON user_player_ratings FOR SELECT USING (true);

-- ── 4. Live Elo trigger ─────────────────────────────────────────────────────
-- Every attributed 1-v-1 pairwise vote moves the voter's two player ratings
-- (K=32 Elo). Multi-player events (calculator trades) don't map cleanly onto
-- a per-player board and are skipped.
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

  INSERT INTO user_player_ratings (user_id, player_id)
  VALUES (NEW.user_id, winner), (NEW.user_id, loser)
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

DROP TRIGGER IF EXISTS trg_personal_rating ON value_events;
CREATE TRIGGER trg_personal_rating
  AFTER INSERT ON value_events
  FOR EACH ROW EXECUTE FUNCTION apply_personal_rating();
