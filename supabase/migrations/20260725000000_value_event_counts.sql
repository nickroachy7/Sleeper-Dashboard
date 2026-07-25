-- ── Value-move attribution (counts only) ────────────────────────────────────
-- The PlayerDetail "why the value moved" receipt wants to say "3 real trades +
-- 61 votes moved the market this week." That signal lives in value_events, which
-- has an INSERT policy but deliberately NO public SELECT (a voter's individual
-- takes are private; only aggregates are safe to expose).
--
-- This SECURITY DEFINER function returns COUNTS ONLY for one player over a
-- window — never any row, side, voter_id, or user_id — so it exposes nothing
-- about who voted or what. That keeps the privacy model intact while letting the
-- client show transparent, aggregate attribution.
--
-- "trades" = real ingested Sleeper trades (kind='trade'); "votes" = the crowd's
-- pairwise/calculator submissions (everything else). A player is matched if it
-- appears on either side of the event (side_a/side_b are JSON arrays of
-- { player_id } / { pick }).

CREATE OR REPLACE FUNCTION value_event_counts(p_player_id TEXT, p_since DATE)
RETURNS TABLE (trades BIGINT, votes BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH matched AS (
    SELECT ve.kind
    FROM value_events ve
    WHERE ve.created_at >= p_since
      AND (
        ve.side_a @> jsonb_build_array(jsonb_build_object('player_id', p_player_id))
        OR ve.side_b @> jsonb_build_array(jsonb_build_object('player_id', p_player_id))
      )
  )
  SELECT
    count(*) FILTER (WHERE kind = 'trade')  AS trades,
    count(*) FILTER (WHERE kind <> 'trade') AS votes
  FROM matched;
$$;

-- Callable by the anon/authenticated roles the browser uses. It only ever
-- returns two integers, so exposing it is safe.
GRANT EXECUTE ON FUNCTION value_event_counts(TEXT, DATE) TO anon, authenticated;
