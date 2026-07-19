-- ── User feedback & bug reports ─────────────────────────────────────────────
-- A public "Feedback" surface lets any visitor leave a bug report, idea, or
-- note — with optional screenshot attachments. Writes come straight from the
-- browser (anon key), so this mirrors the value_events hardening: RLS is
-- INSERT-only with bounded input, there is no client SELECT policy (the inbox
-- is admin-only), and a per-submitter rate limit caps abuse.

-- ── 1. Table ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          TEXT NOT NULL DEFAULT 'bug',    -- 'bug' | 'idea' | 'other'
  message       TEXT NOT NULL,
  email         TEXT,                            -- optional, for follow-up
  attachments   JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array of public image URLs
  -- context (all optional; captured automatically by the client)
  page_url      TEXT,
  user_agent    TEXT,
  submitter_id  TEXT,                            -- coarse localStorage identity
  -- triage
  status        TEXT NOT NULL DEFAULT 'open',    -- 'open' | 'reviewing' | 'closed'
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT feedback_kind_chk    CHECK (kind IN ('bug', 'idea', 'other')),
  CONSTRAINT feedback_message_chk CHECK (char_length(message) BETWEEN 1 AND 5000),
  CONSTRAINT feedback_email_chk   CHECK (email IS NULL OR char_length(email) <= 320)
);

CREATE INDEX IF NOT EXISTS idx_feedback_created  ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_status   ON feedback (status);
CREATE INDEX IF NOT EXISTS idx_feedback_submitter_time
  ON feedback (submitter_id, created_at DESC) WHERE submitter_id IS NOT NULL;

-- ── 2. RLS: browser may INSERT only, with bounded input ─────────────────────
-- No SELECT policy: the raw feedback log is not readable from the client. New
-- rows must be freshly 'open' — a browser can't forge a triaged/closed report.
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feedback_insert ON feedback;
CREATE POLICY feedback_insert ON feedback
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    kind IN ('bug', 'idea', 'other')
    AND char_length(message) BETWEEN 1 AND 5000
    AND status = 'open'
  );

-- ── 3. Per-submitter rate limit ─────────────────────────────────────────────
-- Mirrors enforce_vote_rate_limit: cap how many reports one submitter_id can
-- file per window. SECURITY DEFINER so the COUNT can see prior rows despite the
-- table having no anon SELECT policy. Server-side inserts (NULL submitter_id)
-- are exempt.
CREATE OR REPLACE FUNCTION enforce_feedback_rate_limit() RETURNS trigger AS $$
DECLARE
  per_10min CONSTANT INT := 5;
  per_day   CONSTANT INT := 25;
  n_recent INT;
  n_day INT;
BEGIN
  IF NEW.submitter_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO n_recent FROM feedback
    WHERE submitter_id = NEW.submitter_id AND created_at >= NOW() - INTERVAL '10 minutes';
  IF n_recent >= per_10min THEN
    RAISE EXCEPTION 'Too many reports — give it a few minutes.' USING ERRCODE = '53400';
  END IF;

  SELECT count(*) INTO n_day FROM feedback
    WHERE submitter_id = NEW.submitter_id AND created_at >= NOW() - INTERVAL '1 day';
  IF n_day >= per_day THEN
    RAISE EXCEPTION 'Daily feedback limit reached — check back tomorrow.' USING ERRCODE = '53400';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_feedback_rate_limit ON feedback;
CREATE TRIGGER trg_feedback_rate_limit
  BEFORE INSERT ON feedback
  FOR EACH ROW EXECUTE FUNCTION enforce_feedback_rate_limit();

-- ── 4. Storage bucket for screenshot attachments ────────────────────────────
-- Public-read bucket so the stored URLs render in the admin inbox without
-- signing. Anonymous users may upload into it (the client caps count/size/type
-- before upload); nobody may update or delete existing objects.
INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback-attachments', 'feedback-attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS feedback_attachments_insert ON storage.objects;
CREATE POLICY feedback_attachments_insert ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'feedback-attachments');

DROP POLICY IF EXISTS feedback_attachments_read ON storage.objects;
CREATE POLICY feedback_attachments_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'feedback-attachments');
