-- ── Public multi-tenant: tracked leagues + rate limiting ───────────────────
-- Turns the single-league dashboard into a public app: any visitor can add a
-- Sleeper league. `tracked_leagues` is the registry the sync cron iterates over;
-- `rate_limits` bounds abuse on public write endpoints (add-league, value votes).

-- Registry of leagues to keep synced. root_league_id is the current-season
-- league_id (head of the previous_league_id chain). No FK to `leagues` — a
-- league is registered as part of its own ingest, which populates `leagues`.
CREATE TABLE IF NOT EXISTS tracked_leagues (
  root_league_id   TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  season           TEXT NOT NULL,
  added_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at   TIMESTAMPTZ,
  last_sync_status TEXT,            -- 'pending' | 'ok' | 'error'
  sync_error       TEXT
);

ALTER TABLE tracked_leagues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON tracked_leagues FOR SELECT USING (true);
-- Writes go only through edge functions (service role bypasses RLS).

-- Seed the founding league so the generalized sync-league-data cron keeps
-- syncing it after this migration (the old cron targeted the most-recent row).
INSERT INTO tracked_leagues (root_league_id, name, season)
VALUES ('1312080194361638912', 'Dynasty Reloaded', '2026')
ON CONFLICT (root_league_id) DO NOTHING;

-- Sliding-window rate limiter. One row per allowed action; a window count
-- gates further actions. Pruned by the cleanup-rate-limits job.
CREATE TABLE IF NOT EXISTS rate_limits (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket     TEXT NOT NULL,        -- e.g. 'add-league', 'value-vote'
  key        TEXT NOT NULL,        -- e.g. client IP or device id
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
  ON rate_limits (bucket, key, created_at DESC);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (edge functions) reads/writes this table.
