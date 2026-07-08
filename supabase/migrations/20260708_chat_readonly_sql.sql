-- ============================================================================
-- Read-only SQL executor for the league chatbot
-- ============================================================================
-- The `chat` edge function lets Claude answer questions by querying the
-- database. This function is the only surface it gets: SELECT-only, wrapped
-- in a subquery (which also blocks data-modifying CTEs and multi-statement
-- injection — both are syntax errors inside a FROM subquery), with a
-- statement timeout and a hard row cap.
--
-- EXECUTE is revoked from anon/authenticated/PUBLIC; only service_role
-- (used by the edge function) can call it.
-- ============================================================================

CREATE OR REPLACE FUNCTION execute_readonly_sql(query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  IF query !~* '^\s*(select|with)\M' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  EXECUTE 'SET LOCAL statement_timeout = ''8s''';

  -- Subquery wrap: multiple statements and data-modifying CTEs cannot parse
  -- here. LIMIT 500 caps the payload regardless of the model's query.
  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (SELECT * FROM (%s) q LIMIT 500) t',
    query
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION execute_readonly_sql(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION execute_readonly_sql(TEXT) TO service_role;
