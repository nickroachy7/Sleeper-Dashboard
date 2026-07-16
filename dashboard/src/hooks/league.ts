import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { fetchAllRows, useLeagueIds } from './queries';

// ── League-wide data hooks (the League overview page) ──────────────
// Standings, weekly scoreboard, the record book, and all-time manager
// history are all derived in the page from two cached blobs: the league
// directory (rosters/names, already cached elsewhere) and the raw matchup
// rows fetched here. Kept out of detail.ts so the League page stays
// self-contained.

export interface MatchupRow {
  league_id: string;
  week: number;
  matchup_id: number | null;
  roster_id: number;
  points: number | null;
}

/**
 * Every matchup row across the active dynasty's season chain, in one cached
 * query. Powers the weekly scoreboard, win/loss streaks in the standings, and
 * the single-game record book. Scoped to the active chain so a second dynasty
 * in the DB never bleeds in; an empty chain fetches nothing.
 */
export function useLeagueMatchups() {
  const { data: ids } = useLeagueIds();
  const chain = ids?.chain ?? [];
  return useQuery({
    queryKey: ['league-matchups', chain.join(',') || 'none'],
    enabled: chain.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MatchupRow[]> => {
      return fetchAllRows<MatchupRow>((from, to) =>
        supabase
          .from('matchups')
          .select('league_id, week, matchup_id, roster_id, points')
          .in('league_id', chain)
          .range(from, to)
      );
    },
  });
}
