-- ── Feedback → Slack delivery (AFTER INSERT webhook) ────────────────────────
-- When a `feedback` row is inserted, asynchronously POST it to the
-- feedback-to-slack edge function, which formats a Slack Block Kit message and
-- posts it to the team channel. This mirrors the pg_cron + pg_net + vault
-- pattern from 20260402_live_transaction_sync / 20260712_schedule_community…
--
-- Why pg_net: net.http_post enqueues the request and returns immediately, so a
-- slow or failing Slack call can NEVER block or roll back the user's insert. The
-- feedback row is the source of truth; Slack delivery is best-effort. The whole
-- trigger body is additionally wrapped in an exception handler so that even a
-- misconfiguration (e.g. missing vault secret) can't break feedback submission.
--
-- Config (reuses the existing vault secrets seeded for the sync crons):
--   project_url       — https://<PROJECT_REF>.supabase.co  (already seeded)
--   service_role_key  — service role JWT                    (already seeded)
--
-- Optional hardening — a shared secret the edge function checks via the
-- `x-webhook-secret` header. It is OFF by default (delivery works with no extra
-- setup). To enable it you must set BOTH sides to the SAME value:
--   1. Edge function secret (read by feedback-to-slack via Deno.env):
--        supabase secrets set FEEDBACK_WEBHOOK_SECRET=<value> --project-ref yxtnocecnqutcvltptya
--   2. Vault secret (read by this trigger to send the header):
--        SELECT vault.create_secret('<value>', 'feedback_webhook_secret');
-- If only the vault secret is set, the header is sent but the function ignores
-- it. If only the edge secret is set, the function rejects delivery (401) until
-- the vault secret is added — so always set both together.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION notify_feedback_slack() RETURNS trigger AS $$
DECLARE
  base_url TEXT;
  fn_secret TEXT;
  req_headers JSONB;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO base_url
      FROM vault.decrypted_secrets WHERE name = 'project_url';

    -- No project_url configured → nothing to call. Skip silently.
    IF base_url IS NULL THEN
      RETURN NEW;
    END IF;

    req_headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- Included for robustness: delivery keeps working even if the function is
      -- ever redeployed with verify_jwt on. The function itself is deployed
      -- --no-verify-jwt and gates on x-webhook-secret instead.
      'Authorization', 'Bearer ' || COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'), ''
      )
    );

    -- Attach the shared-secret header only when the vault secret exists.
    SELECT decrypted_secret INTO fn_secret
      FROM vault.decrypted_secrets WHERE name = 'feedback_webhook_secret';
    IF fn_secret IS NOT NULL THEN
      req_headers := req_headers || jsonb_build_object('x-webhook-secret', fn_secret);
    END IF;

    PERFORM net.http_post(
      url := base_url || '/functions/v1/feedback-to-slack',
      headers := req_headers,
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', 'feedback',
        'record', to_jsonb(NEW)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never let Slack delivery affect the insert. Log and move on.
    RAISE WARNING 'notify_feedback_slack failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_feedback_slack ON feedback;
CREATE TRIGGER trg_feedback_slack
  AFTER INSERT ON feedback
  FOR EACH ROW EXECUTE FUNCTION notify_feedback_slack();
