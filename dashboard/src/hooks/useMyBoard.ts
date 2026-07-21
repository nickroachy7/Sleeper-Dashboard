import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from './queries';
import { blendedValue, type RatingRow } from '../lib/board';

export interface MyBoardRow extends RatingRow {
  wins: number;
  losses: number;
  /** Blended board value — the number the personal ranking is ordered by. */
  blended: number;
  /** Whether the user has expressed any opinion on this asset (rating ≠ 1500). */
  moved: boolean;
}

/**
 * The signed-in user's own materialized ranking board, ordered by blended value
 * (highest first) — the same order their /u/<name> profile shows. Returns null
 * data for guests. This is the source for "catered" vote matchups drawn from a
 * user's OWN top players rather than the community board.
 *
 * Rows come straight from user_player_ratings (fully materialized per user), so
 * this is one query; the blend is cheap and done client-side.
 */
export function useMyBoard(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['my-board', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<MyBoardRow[]> => {
      // Page through the whole board: PostgREST caps a single response at 1,000
      // rows, so a lone `.limit(6000)` silently drops most of a materialized
      // board (2,500+ rows) — and with it many high-value players the catered
      // pool should draw from. fetchAllRows walks every page.
      const rows = await fetchAllRows<RatingRow & { wins: number; losses: number }>((from, to) =>
        supabase
          .from('user_player_ratings')
          .select('player_id, rating, wins, losses, baseline_value')
          .eq('user_id', userId!)
          .range(from, to)
      );
      return rows
        .map((r) => ({
          ...r,
          blended: blendedValue(r),
          moved: r.rating !== 1500,
        }))
        .sort((a, b) => b.blended - a.blended);
    },
  });
}
