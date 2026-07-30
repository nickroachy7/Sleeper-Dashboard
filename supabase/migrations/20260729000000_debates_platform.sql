-- ============================================================================
-- Debate Platform — generalize the value engine to any rankable subject
-- ============================================================================
-- STATUS: STAGED, not yet deployed. The frontend runs a local-first stand-in
-- (lib/debates/vote-store.ts + engine.ts) that mirrors these shapes EXACTLY, so
-- deploying this migration + a swap of the vote-store internals cuts the app
-- over to the real backend with no UI change. Mirrors the pattern of the
-- community_value_system migration: additive, coexists with the fantasy tables.
--
-- The insight behind the pivot: `value_events` was already an abstract "side A
-- was preferred over side B" preference log, and the Glicko engine just consumes
-- preferences. It only happened to be pointed at dynasty players. Here we add a
-- generic subject/debate layer so the SAME engine rates athletes, teams, moments
-- — anything the crowd argues about — with debate-scoped ratings.
-- ============================================================================

-- ── 1. Debates (the questions with their own leaderboards) ──────────────────
CREATE TABLE IF NOT EXISTS debates (
  id          TEXT PRIMARY KEY,               -- 'nba-goat'
  slug        TEXT NOT NULL UNIQUE,
  category    TEXT NOT NULL,                  -- 'NBA' | 'NFL' | 'Cross-Sport' | …
  question    TEXT NOT NULL,
  hook        TEXT NOT NULL,
  storyline   TEXT NOT NULL,                  -- markdown editorial body
  kind        TEXT NOT NULL DEFAULT 'pairwise',
  featured    BOOLEAN NOT NULL DEFAULT FALSE,
  published   TEXT,                           -- display label ('Jul 2026')
  -- provenance: who created it. NULL = editorial canon; a user_id = community.
  created_by  UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Subjects (anything rankable, scoped to a debate) ─────────────────────
-- A subject belongs to exactly one debate's roster. The same real-world person
-- can appear in many debates as distinct rows (LeBron in 'nba-goat' and
-- 'goat-athlete') — ratings are debate-scoped by design.
CREATE TABLE IF NOT EXISTS debate_subjects (
  id          TEXT NOT NULL,                  -- 'michael-jordan' (unique within debate)
  debate_id   TEXT NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  subtitle    TEXT,
  image_url   TEXT,
  blurb       TEXT,
  facts       JSONB,                          -- string[]
  seed        INT NOT NULL DEFAULT 999,        -- editorial prior rank (1 = favorite)
  PRIMARY KEY (debate_id, id)
);

-- ── 3. Debate events (the preference log — mirrors value_events) ────────────
-- One row per pairwise pick within a debate. Deliberately the SAME shape as
-- value_events so the compute engine can share code: within `debate_id`,
-- `winner_id` was preferred over `loser_id`.
CREATE TABLE IF NOT EXISTS debate_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id    TEXT NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  winner_id    TEXT NOT NULL,                 -- subject id within the debate
  loser_id     TEXT NOT NULL,
  weight       NUMERIC NOT NULL DEFAULT 1.0,
  voter_id     TEXT,                          -- coarse anon identity (abuse control)
  user_id      UUID,                          -- attributed vote → personal board
  processed_at TIMESTAMPTZ,                   -- NULL until the engine consumes it
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (debate_id, winner_id) REFERENCES debate_subjects (debate_id, id) ON DELETE CASCADE,
  FOREIGN KEY (debate_id, loser_id)  REFERENCES debate_subjects (debate_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_debate_events_unprocessed
  ON debate_events (created_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_debate_events_debate ON debate_events (debate_id);
CREATE INDEX IF NOT EXISTS idx_debate_events_user   ON debate_events (user_id) WHERE user_id IS NOT NULL;

-- ── 4. Community ratings (the crowd's standing per subject per debate) ──────
-- Glicko-2 state, debate-scoped. Written by the compute function each run;
-- read by the app for the live leaderboard.
CREATE TABLE IF NOT EXISTS debate_ratings (
  debate_id   TEXT NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  subject_id  TEXT NOT NULL,
  rating      NUMERIC NOT NULL DEFAULT 1500,
  rd          NUMERIC NOT NULL DEFAULT 350,
  volatility  NUMERIC NOT NULL DEFAULT 0.06,
  matches     INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (debate_id, subject_id),
  FOREIGN KEY (debate_id, subject_id) REFERENCES debate_subjects (debate_id, id) ON DELETE CASCADE
);

-- ── 5. Per-user ratings (personal boards — powers "your take vs the crowd") ─
-- Mirrors user_player_ratings. The viewer's own standing for each subject,
-- derived from only their attributed votes. This is what makes the vs-crowd
-- delta real per person on any debate.
CREATE TABLE IF NOT EXISTS user_debate_ratings (
  user_id     UUID NOT NULL,
  debate_id   TEXT NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  subject_id  TEXT NOT NULL,
  rating      NUMERIC NOT NULL DEFAULT 1500,
  wins        INT NOT NULL DEFAULT 0,
  losses      INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, debate_id, subject_id)
);

-- ── 6. RLS ──────────────────────────────────────────────────────────────────
-- Debates + subjects + crowd ratings are public read (the whole point is an
-- open, account-optional platform). Browsers may INSERT pairwise votes only,
-- and only attributed to themselves; high-trust or bulk ingestion is
-- service-role only. Personal boards are private to their owner.

ALTER TABLE debates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE debate_subjects    ENABLE ROW LEVEL SECURITY;
ALTER TABLE debate_ratings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE debate_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_debate_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY debates_public_read        ON debates          FOR SELECT USING (TRUE);
CREATE POLICY subjects_public_read       ON debate_subjects  FOR SELECT USING (TRUE);
CREATE POLICY ratings_public_read        ON debate_ratings   FOR SELECT USING (TRUE);

-- Anyone may cast a pairwise vote; authenticated votes must be self-attributed.
CREATE POLICY debate_events_insert_votes ON debate_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    weight <= 1.5
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- A user reads and the trigger/engine maintains only their own board.
CREATE POLICY user_debate_ratings_owner ON user_debate_ratings
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- NB: the compute-debate-values edge function (to be added, modeled on
-- compute-community-values) runs with the service role: it reads unprocessed
-- debate_events, advances debate_ratings (Glicko) + user_debate_ratings, and
-- stamps processed_at. Seed data (canon debates/subjects) is loaded from
-- lib/debates/catalog.ts via a one-off seed script or an editorial insert.
