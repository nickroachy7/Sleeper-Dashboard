-- ── Public hardening ───────────────────────────────────────────────────────
-- Going public exposes two anonymous write paths — community votes (direct
-- browser inserts into value_events) and league tracking. Bound both, and add
-- maintenance to keep the new tables and sync workload from growing unbounded.

-- ── 1. Vote rate limiting ──────────────────────────────────────────────────
-- Votes insert straight from the browser (anon key) with a localStorage
-- voter_id. A BEFORE INSERT trigger caps how many a single voter_id can submit
-- per minute and per hour — server-side enforcement without rerouting the
-- client through an edge function. Server-side inserts (real trades) carry a
-- NULL voter_id and are exempt.

CREATE INDEX IF NOT EXISTS idx_value_events_voter_time
  ON value_events (voter_id, created_at DESC)
  WHERE voter_id IS NOT NULL;

CREATE OR REPLACE FUNCTION enforce_vote_rate_limit() RETURNS trigger AS $$
DECLARE
  per_minute CONSTANT INT := 30;
  per_hour   CONSTANT INT := 300;
  n_minute INT;
  n_hour INT;
BEGIN
  -- Only rate-limit client votes (voter_id present); trust server inserts.
  IF NEW.voter_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO n_minute FROM value_events
    WHERE voter_id = NEW.voter_id AND created_at >= NOW() - INTERVAL '1 minute';
  IF n_minute >= per_minute THEN
    RAISE EXCEPTION 'Too many votes — slow down a moment.' USING ERRCODE = '53400';
  END IF;

  SELECT count(*) INTO n_hour FROM value_events
    WHERE voter_id = NEW.voter_id AND created_at >= NOW() - INTERVAL '1 hour';
  IF n_hour >= per_hour THEN
    RAISE EXCEPTION 'Hourly vote limit reached — check back later.' USING ERRCODE = '53400';
  END IF;

  RETURN NEW;
END;
-- SECURITY DEFINER is required: anon has an INSERT policy but NO SELECT policy
-- on value_events, so without it RLS would filter the COUNT to 0 for every
-- anonymous voter and the limit would never fire.
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_vote_rate_limit ON value_events;
CREATE TRIGGER trg_vote_rate_limit
  BEFORE INSERT ON value_events
  FOR EACH ROW EXECUTE FUNCTION enforce_vote_rate_limit();

-- ── 2. Tracked-league TTL ──────────────────────────────────────────────────
-- Track when a league was last viewed so abandoned leagues can stop being
-- synced. The client "touches" its active league via the RPC below.
ALTER TABLE tracked_leagues ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;

-- Anon-callable: bump last_viewed_at for a league. SECURITY DEFINER so it can
-- write despite the table's read-only RLS. Safe: it only touches a timestamp.
CREATE OR REPLACE FUNCTION touch_tracked_league(p_root TEXT) RETURNS void AS $$
  UPDATE tracked_leagues SET last_viewed_at = NOW() WHERE root_league_id = p_root;
$$ LANGUAGE sql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION touch_tracked_league(TEXT) TO anon, authenticated;

-- ── 3. Maintenance crons ───────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Prune rate-limit rows daily (only the trailing window matters).
SELECT cron.schedule(
  'cleanup-rate-limits', '0 4 * * *',
  $job$ DELETE FROM rate_limits WHERE created_at < NOW() - INTERVAL '2 days'; $job$
);

-- Un-track leagues not viewed in 60 days so the sync workload stays bounded.
-- Leagues with a NULL last_viewed_at (e.g. the seeded founding league) are
-- never pruned. League data rows are left in place (non-destructive); only the
-- sync registration is removed.
SELECT cron.schedule(
  'cleanup-tracked-leagues', '30 4 * * *',
  $job$ DELETE FROM tracked_leagues
        WHERE last_viewed_at IS NOT NULL
          AND last_viewed_at < NOW() - INTERVAL '60 days'; $job$
);
