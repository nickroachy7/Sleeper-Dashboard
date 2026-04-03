-- ============================================================================
-- Live Transaction Sync Setup
-- ============================================================================
-- This migration does two things:
-- 1. Creates a pg_cron job to call sync-transactions-live every 5 minutes
-- 2. Enables Supabase Realtime on key tables so the frontend auto-updates
--
-- Prerequisites:
--   - pg_cron extension must be enabled (Supabase has it by default)
--   - pg_net extension must be enabled (for HTTP calls from pg_cron)
--   - The sync-transactions-live edge function must be deployed
-- ============================================================================

-- 1. Enable required extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Schedule the live transaction sync every 5 minutes
-- This calls the edge function via HTTP using pg_net
SELECT cron.schedule(
  'sync-transactions-live',           -- job name
  '*/5 * * * *',                      -- every 5 minutes
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-transactions-live',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 3. Enable Realtime on tables the frontend subscribes to
-- (Supabase Realtime requires tables to be added to the publication)
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE rosters;
ALTER PUBLICATION supabase_realtime ADD TABLE traded_picks;

-- ============================================================================
-- NOTE: If the above cron.schedule call fails because app.settings aren't
-- configured, you can manually set it up in the Supabase Dashboard:
--
-- Go to: Database > Extensions > pg_cron
-- Or run this with your actual project URL and service role key:
--
--   SELECT cron.schedule(
--     'sync-transactions-live',
--     '*/5 * * * *',
--     $$
--     SELECT net.http_post(
--       url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-transactions-live',
--       headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb,
--       body := '{}'::jsonb
--     );
--     $$
--   );
-- ============================================================================
