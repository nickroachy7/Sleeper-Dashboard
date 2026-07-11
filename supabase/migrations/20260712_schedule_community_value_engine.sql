-- ============================================================================
-- Schedule the community value engine
-- ============================================================================
-- Runs compute-community-values on a cron so real trades and fan votes flow
-- into values automatically, instead of only when invoked by hand. Mirrors the
-- pg_cron + pg_net + vault pattern from 20260402_live_transaction_sync.
--
-- Every 15 minutes: the engine ingests new completed trades, consumes any
-- pending vote events, updates Glicko ratings + confidence, and rewrites the
-- community board. It's cheap (~1.5s) and idempotent — a run with no new
-- signals just re-derives the same board and widens idle deviations slightly.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'compute-community-values',
  '*/15 * * * *',
  $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/compute-community-values',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'),
      'Content-Type', 'application/json'),
    body := '{}'::jsonb);
  $job$
);
