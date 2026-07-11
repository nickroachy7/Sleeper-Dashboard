-- ============================================================================
-- Community Value System
-- ============================================================================
-- Stands up a KTC-free, crowdsourced value pipeline ALONGSIDE the existing
-- keeptradecut source. Nothing here touches KTC data or the app's current
-- reads. The app only switches over when VALUE_SOURCE flips in the frontend.
--
-- The two value tables already carry a `source` column, so community values
-- coexist with KTC values keyed by (player_id, source, superflex). This
-- migration adds the two NEW tables the community pipeline needs:
--
--   1. player_facts  — objective, non-proprietary facts (nflverse + Sleeper)
--                      that feed the "objective prior" cold-start model.
--   2. value_events  — every crowd/real-world comparison, normalized to one
--                      shape: assets on side A were preferred over side B at
--                      time T. Pairwise taps, real trades, and calculator
--                      submissions all land here; the Glicko engine reads it.
-- ============================================================================

-- ── 1. Objective facts (the prior's inputs) ─────────────────────────────────
-- One row per player per season. Sourced from nflverse (open data) + Sleeper.
-- These are FACTS, not values: production, age, draft capital. The prior model
-- turns them into a starting value; the crowd corrects it from there.
CREATE TABLE IF NOT EXISTS player_facts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  season        INT  NOT NULL,
  -- identity / capital
  age           NUMERIC,        -- age during that season
  years_exp     INT,
  draft_round   INT,            -- NULL = undrafted
  draft_pick    INT,            -- overall pick number
  -- production (per that season)
  games         INT,
  fantasy_ppg   NUMERIC,        -- PPR fantasy points per game
  fantasy_total NUMERIC,        -- PPR fantasy points, full season
  snap_share    NUMERIC,        -- 0..1 offensive snap share, when available
  -- provenance
  gsis_id       TEXT,           -- nflverse key, kept for debugging joins
  source        TEXT NOT NULL DEFAULT 'nflverse',
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (player_id, season, source)
);

CREATE INDEX IF NOT EXISTS idx_player_facts_player  ON player_facts (player_id, season DESC);
CREATE INDEX IF NOT EXISTS idx_player_facts_season  ON player_facts (season);

-- ── 2. Normalized comparison events (the engine's inputs) ───────────────────
-- Every signal that a set of assets was preferred over another set. `kind`
-- records the surface it came from; the engine can weight surfaces differently
-- (a real executed trade is stronger evidence than one anonymous tap).
--
-- Assets are stored as JSONB arrays so a single event can mix players and
-- picks, e.g. side_a = [{"player_id":"4046"}], side_b = [{"pick":"2026-1st-early"}].
CREATE TABLE IF NOT EXISTS value_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL,          -- 'pairwise' | 'trade' | 'calculator' | 'ranking'
  side_a       JSONB NOT NULL,         -- winning / kept / acquired side
  side_b       JSONB NOT NULL,         -- losing / passed / given side
  outcome      NUMERIC NOT NULL DEFAULT 1.0,  -- 1 = A preferred, 0.5 = even/fair, 0 = B preferred
  weight       NUMERIC NOT NULL DEFAULT 1.0,  -- surface trust multiplier
  -- provenance (all optional; anonymous events are fine)
  voter_id     TEXT,                   -- app user / session; NULL for real trades
  league_id    TEXT REFERENCES leagues(league_id) ON DELETE SET NULL,
  source_ref   TEXT,                   -- e.g. sleeper transaction_id, for dedupe
  format_sf    BOOLEAN NOT NULL DEFAULT TRUE, -- superflex vs 1QB context
  -- lifecycle
  processed_at TIMESTAMPTZ,            -- NULL until the engine has consumed it
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_value_events_unprocessed
  ON value_events (created_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_value_events_kind ON value_events (kind);

-- Real trades must not be counted twice if a sync re-runs. Anonymous pairwise
-- taps intentionally have source_ref = NULL and are allowed to repeat — a plain
-- unique index handles both, since Postgres treats NULLs as distinct (so many
-- null rows never collide). NOT a partial index: PostgREST can't use a partial
-- index as an ON CONFLICT arbiter (error 42P10), and the engine upserts trades
-- with on_conflict=source_ref.
CREATE UNIQUE INDEX IF NOT EXISTS uq_value_events_source_ref
  ON value_events (source_ref);

-- Browser clients (anon key) submit pairwise/calculator votes directly. Lock
-- that down: RLS on, INSERT only, and only the low-trust kinds — 'trade' events
-- are ingested server-side by the edge function with the service role, so a
-- browser can never forge a high-weight trade signal. No SELECT policy: the
-- raw event log isn't readable from the client.
ALTER TABLE value_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY value_events_insert_votes ON value_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    kind IN ('pairwise', 'calculator')
    AND weight <= 1.5
    AND source_ref IS NULL
  );

-- ── 3. Glicko-2 rating state ────────────────────────────────────────────────
-- Persistent per-player rating the engine reads and writes each run. Kept
-- separate from player_values because it lives in Glicko rating space (~1500
-- centered); player_values holds the derived 0–9999 display value.
CREATE TABLE IF NOT EXISTS community_ratings (
  player_id   TEXT PRIMARY KEY REFERENCES players(player_id) ON DELETE CASCADE,
  rating      NUMERIC NOT NULL DEFAULT 1500,  -- Glicko-2 rating
  rd          NUMERIC NOT NULL DEFAULT 350,   -- rating deviation (uncertainty)
  volatility  NUMERIC NOT NULL DEFAULT 0.06,  -- Glicko-2 sigma
  matches     INT NOT NULL DEFAULT 0,         -- lifetime comparisons seen
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. Community value provenance ───────────────────────────────────────────
-- player_values / player_value_history already accept any `source`. The
-- community pipeline writes rows with source = 'community'. We add a column to
-- carry the Glicko rating deviation (confidence band) so the app can show how
-- settled a value is — KTC never had this.
ALTER TABLE player_values      ADD COLUMN IF NOT EXISTS rating_deviation NUMERIC;
ALTER TABLE player_value_history ADD COLUMN IF NOT EXISTS rating_deviation NUMERIC;
