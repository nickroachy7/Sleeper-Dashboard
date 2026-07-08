-- ============================================================================
-- Sync Cron Jobs + Realtime
-- ============================================================================
-- 1. Schedules every sync edge function via pg_cron + pg_net
-- 2. Enables Supabase Realtime on the tables the frontend subscribes to
--
-- The job bodies read the project URL and service role key from Supabase
-- Vault (managed Postgres denies ALTER DATABASE/ROLE ... SET, so the older
-- app.settings.* approach cannot be configured). After pushing this migration
-- to a fresh project, seed the two secrets once:
--
--   SELECT vault.create_secret('https://<PROJECT_REF>.supabase.co', 'project_url');
--   SELECT vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
--
-- Jobs fail silently (net.http_post to a NULL url) until the secrets exist.
-- ============================================================================

-- 1. Enable required extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Schedule all sync functions
DO $$
DECLARE
  job RECORD;
BEGIN
  FOR job IN SELECT * FROM (VALUES
    ('sync-transactions-live', '*/5 * * * *'),  -- live trades/waivers
    ('sync-league-data',       '0 */6 * * *'),  -- full multi-season sync
    ('sync-players',           '0 8 * * *'),    -- Sleeper player DB (4 AM ET)
    ('sync-ktc-values',        '0 10 * * *'),   -- KTC values (6 AM ET)
    ('sync-nfl-state',         '0 * * * *')     -- current NFL week
  ) AS t(name, sched) LOOP
    PERFORM cron.schedule(job.name, job.sched, format(
      $job$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/%s',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'),
          'Content-Type', 'application/json'),
        body := '{}'::jsonb);
      $job$, job.name));
  END LOOP;
END $$;

-- 3. Enable Realtime on tables the frontend subscribes to
-- (Supabase Realtime requires tables to be added to the publication)
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE rosters;
ALTER PUBLICATION supabase_realtime ADD TABLE traded_picks;
