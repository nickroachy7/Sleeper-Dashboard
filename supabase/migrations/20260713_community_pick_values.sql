-- ============================================================================
-- Community pick values
-- ============================================================================
-- Brings draft picks into the community value system. Picks are rated by the
-- same Glicko engine as players, on the same scale, so a real "player for 2029
-- 1st" trade calibrates the pick against actual player values automatically.
--
-- pick_values had no `source` column (unlike player_values), so community pick
-- values would have collided with KTC's. We add source + rating_deviation and
-- move the unique key to include source, mirroring player_values.
-- ============================================================================

ALTER TABLE pick_values ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'keeptradecut';
ALTER TABLE pick_values ADD COLUMN IF NOT EXISTS rating_deviation NUMERIC;

-- Move the uniqueness to include source so KTC + community picks coexist.
DROP INDEX IF EXISTS uq_pick_values_year_round_tier;
DELETE FROM pick_values a USING pick_values b
 WHERE a.ctid < b.ctid
   AND a.pick_year = b.pick_year
   AND a.pick_round = b.pick_round
   AND a.pick_tier IS NOT DISTINCT FROM b.pick_tier
   AND a.source = b.source;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pick_values_year_round_tier_source
  ON pick_values (pick_year, pick_round, pick_tier, source) NULLS NOT DISTINCT;

-- Glicko-2 state for draft picks. Keyed by '{year}-{round}' (e.g. '2029-1') —
-- the granularity a trade actually references (a trade names a season + round,
-- never a tier). Tiers are expanded on display from the (year, round) value.
CREATE TABLE IF NOT EXISTS community_pick_ratings (
  pick_key    TEXT PRIMARY KEY,        -- '{year}-{round}'
  pick_year   INT NOT NULL,
  pick_round  INT NOT NULL,
  rating      NUMERIC NOT NULL DEFAULT 1500,
  rd          NUMERIC NOT NULL DEFAULT 350,
  volatility  NUMERIC NOT NULL DEFAULT 0.06,
  matches     INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
