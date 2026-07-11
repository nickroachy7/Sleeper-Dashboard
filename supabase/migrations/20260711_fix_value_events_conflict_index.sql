-- Fix: the source_ref uniqueness must be a plain (non-partial) unique index so
-- PostgREST can use it as an ON CONFLICT arbiter for the trade-ingest upsert.
DROP INDEX IF EXISTS uq_value_events_source_ref;
CREATE UNIQUE INDEX IF NOT EXISTS uq_value_events_source_ref
  ON value_events (source_ref);
