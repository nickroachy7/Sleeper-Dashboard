-- ============================================================================
-- Harden execute_readonly_sql: tolerate a trailing semicolon
-- ============================================================================
-- The chat model almost always appends a trailing ";" to its SELECT. Because
-- the query is wrapped in a FROM subquery ("... FROM (%s) q ..."), a trailing
-- ";" is a syntax error, costing the model a wasted tool round-trip to recover.
--
-- Strip a SINGLE trailing semicolon (plus surrounding whitespace) before
-- wrapping. This does NOT weaken the multi-statement protection: any semicolon
-- in the MIDDLE of the query (e.g. "SELECT 1; DROP TABLE x") still lands inside
-- the subquery and fails to parse, exactly as before. Only one terminator at
-- the very end is removed.
-- ============================================================================

CREATE OR REPLACE FUNCTION execute_readonly_sql(query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  cleaned TEXT;
BEGIN
  -- Trim whitespace, then drop a single trailing ";".
  cleaned := regexp_replace(btrim(query), ';\s*$', '');

  IF cleaned !~* '^\s*(select|with)\M' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  EXECUTE 'SET LOCAL statement_timeout = ''8s''';

  -- Subquery wrap: multiple statements and data-modifying CTEs cannot parse
  -- here. LIMIT 500 caps the payload regardless of the model's query.
  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (SELECT * FROM (%s) q LIMIT 500) t',
    cleaned
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION execute_readonly_sql(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION execute_readonly_sql(TEXT) TO service_role;
