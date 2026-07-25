import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ── Global Hot-Takes leaderboard ─────────────────────────────────────────────
// Ranks managers by how sharp their board is — how many takes the crowd came
// around to ("called"), with conviction (players moved) as the tiebreaker.
//
// Backed by the `hot_takes_leaderboard` SECURITY DEFINER RPC (staged migration
// 20260725010000). Cross-user aggregation can't be done in the browser (a
// visitor can't scan every user's board), so it's server-side. Until the
// migration is deployed the RPC 404s and this returns an empty, "not ready"
// result — the page shows a friendly "coming soon" instead of erroring.

export interface HotTakeLeader {
  rank: number;
  username: string;
  avatarUrl: string | null;
  moved: number;
  called: number;
}

export interface HotTakesResult {
  leaders: HotTakeLeader[];
  /** False when the backing RPC isn't deployed yet (or errored). */
  available: boolean;
  loading: boolean;
}

export function useHotTakesLeaderboard(limit = 25): HotTakesResult {
  const { data, isLoading } = useQuery({
    queryKey: ['hot-takes-leaderboard', limit],
    staleTime: 10 * 60_000,
    // The queryFn swallows errors into { available: false }, so a missing RPC is
    // a normal result, not a failure — never retry (retries would spin the
    // network and delay first paint before the migration ships).
    retry: false,
    queryFn: async (): Promise<{ leaders: HotTakeLeader[]; available: boolean }> => {
      try {
        // Untyped call — the RPC isn't in the generated Database types until it
        // ships. Any error (e.g. 404 before deploy) → "not available".
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc('hot_takes_leaderboard', { p_limit: limit });
        if (error || !Array.isArray(data)) return { leaders: [], available: false };
        const leaders: HotTakeLeader[] = data.map((r: Record<string, unknown>, i: number) => ({
          rank: i + 1,
          username: String(r.username ?? ''),
          avatarUrl: (r.avatar_url as string | null) ?? null,
          moved: Number(r.moved) || 0,
          called: Number(r.called) || 0,
        }));
        return { leaders, available: true };
      } catch {
        return { leaders: [], available: false };
      }
    },
  });

  return {
    leaders: data?.leaders ?? [],
    available: data?.available ?? false,
    loading: isLoading,
  };
}
