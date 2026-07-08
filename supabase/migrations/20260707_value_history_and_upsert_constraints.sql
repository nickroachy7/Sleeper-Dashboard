-- ============================================================================
-- Value History + Upsert Constraint Support
-- ============================================================================
-- Supports the reworked sync functions (multi-season sync + KTC upserts):
--
-- 1. Creates player_value_history for daily KTC value snapshots
--    (sync-ktc-values upserts on player_id,date,source)
-- 2. Adds the unique indexes the new UPSERT calls rely on. PostgREST's
--    on_conflict resolution requires a matching unique constraint/index,
--    otherwise every upsert fails.
--
-- NULLS NOT DISTINCT (Postgres 15+) matters on pick_values: generic picks
-- like "2026 1st" have pick_tier = NULL. With default NULL semantics those
-- rows would never conflict and would duplicate on every daily sync.
-- ============================================================================

-- 1. Daily player value snapshots
CREATE TABLE IF NOT EXISTS player_value_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  value INT NOT NULL,
  rank INT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT NOT NULL DEFAULT 'keeptradecut',
  UNIQUE (player_id, date, source)
);

CREATE INDEX IF NOT EXISTS idx_player_value_history_player_date
  ON player_value_history (player_id, date DESC);

-- 2. Unique indexes for upsert conflict targets

-- player_values: one row per player per source per format
-- (dedupe first in case the old delete-then-insert flow left duplicates)
DELETE FROM player_values a
USING player_values b
WHERE a.ctid < b.ctid
  AND a.player_id = b.player_id
  AND a.source = b.source
  AND a.superflex IS NOT DISTINCT FROM b.superflex;

CREATE UNIQUE INDEX IF NOT EXISTS uq_player_values_player_source_format
  ON player_values (player_id, source, superflex) NULLS NOT DISTINCT;

-- pick_values: one row per year/round/tier (tier NULL = generic pick)
DELETE FROM pick_values a
USING pick_values b
WHERE a.ctid < b.ctid
  AND a.pick_year = b.pick_year
  AND a.pick_round = b.pick_round
  AND a.pick_tier IS NOT DISTINCT FROM b.pick_tier;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pick_values_year_round_tier
  ON pick_values (pick_year, pick_round, pick_tier) NULLS NOT DISTINCT;

-- traded_picks: UNIQUE(league_id, season, round, roster_id) should already
-- exist from the initial schema; recreate defensively for fresh databases.
DELETE FROM traded_picks a
USING traded_picks b
WHERE a.ctid < b.ctid
  AND a.league_id = b.league_id
  AND a.season = b.season
  AND a.round = b.round
  AND a.roster_id = b.roster_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_traded_picks_league_season_round_slot
  ON traded_picks (league_id, season, round, roster_id);

ALTER TABLE traded_picks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
