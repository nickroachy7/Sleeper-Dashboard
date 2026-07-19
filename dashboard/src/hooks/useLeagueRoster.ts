import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ── Rostered players for one league (by root id) ──────────────────
// Returns the set of player_ids currently rostered anywhere in a league's
// CURRENT season, for filtering the global rankings down to "players in my
// league". Parameterized by an arbitrary root league id (not the app-wide
// active league) so the Ranking page's league filter can point at any of the
// user's leagues without touching global state — same pattern as useRecordBook.
export function useLeagueRoster(rootLeagueId: string | null) {
  return useQuery<Set<string>>({
    queryKey: ['league-roster-set', rootLeagueId ?? 'none'],
    enabled: !!rootLeagueId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Set<string>> => {
      // The root id IS the current-season league_id (head of the chain), so
      // rosters for that league_id are the live rosters. No chain walk needed —
      // we only care about who's rostered right now.
      const { data } = await supabase
        .from('rosters')
        .select('players')
        .eq('league_id', rootLeagueId!);
      const set = new Set<string>();
      for (const r of data ?? []) {
        for (const pid of (r.players as string[] | null) ?? []) set.add(pid);
      }
      return set;
    },
  });
}
