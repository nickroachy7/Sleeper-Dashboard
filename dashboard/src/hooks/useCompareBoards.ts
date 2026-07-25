import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { usePlayerMap } from './useLeagueData';
import { fetchAllRows } from './queries';
import { blendedValue, type RatingRow } from '../lib/board';
import { isPickAsset } from '../lib/vote-assets';

// ── Compare boards ───────────────────────────────────────────────────────────
// "Where you two disagree most." On someone else's profile, a signed-in visitor
// can line their board up against the manager's and see the biggest positional-
// rank gaps. Both boards are public (user_player_ratings, public read), so this
// is entirely client-side — no schema, no new endpoint.
//
// The unit is POSITION rank (QB1, WR4…), the same unit the take-vs-crowd chip
// uses — it's what managers actually argue, and it's stable across the
// offense/IDP value-curve split.

export interface BoardDisagreement {
  playerId: string;
  name: string;
  position: string;
  /** Viewer's position rank for this player. */
  yourPosRank: number;
  /** The other manager's position rank. */
  theirPosRank: number;
  /** theirPosRank − yourPosRank: positive ⇒ YOU are higher on the player. */
  gap: number;
}

export interface CompareBoardsResult {
  /** True once both boards are loaded and the viewer is signed in. */
  ready: boolean;
  /** Whether there's a viewer to compare against (signed in, not your own page). */
  active: boolean;
  disagreements: BoardDisagreement[];
}

/** Position ranks over a board (blended order), top of each position = 1. */
function posRanks(rows: RatingRow[], positionOf: (id: string) => string | null): Map<string, number> {
  const byPos = new Map<string, { id: string; v: number }[]>();
  for (const r of rows) {
    if (isPickAsset(r.player_id)) continue;
    const pos = positionOf(r.player_id);
    if (!pos) continue;
    const arr = byPos.get(pos) ?? [];
    arr.push({ id: r.player_id, v: blendedValue(r) });
    byPos.set(pos, arr);
  }
  const out = new Map<string, number>();
  for (const [, arr] of byPos) {
    arr.sort((a, b) => b.v - a.v);
    arr.forEach((x, i) => out.set(x.id, i + 1));
  }
  return out;
}

/**
 * Compare the signed-in viewer's board against `theirBoard` (the profile being
 * viewed). Inert on your own profile or for guests. `theirUserId` is only used
 * to gate "is this my own page".
 */
export function useCompareBoards(theirUserId: string | undefined, theirBoard: RatingRow[] | undefined): CompareBoardsResult {
  const { user } = useAuth();
  const { data: playersMap } = usePlayerMap();
  const viewerId = user?.id ?? null;
  const active = !!viewerId && !!theirUserId && viewerId !== theirUserId;

  const { data: myBoard } = useQuery({
    queryKey: ['compare-my-board', viewerId],
    enabled: active,
    staleTime: 60_000,
    queryFn: async (): Promise<RatingRow[]> =>
      fetchAllRows<RatingRow>((from, to) =>
        supabase
          .from('user_player_ratings')
          .select('player_id, rating, baseline_value')
          .eq('user_id', viewerId!)
          .range(from, to)
      ),
  });

  return useMemo(() => {
    if (!active || !myBoard || !theirBoard || !playersMap) {
      return { ready: false, active, disagreements: [] };
    }
    const positionOf = (id: string) => playersMap.get(id)?.position ?? null;
    const mine = posRanks(myBoard, positionOf);
    const theirs = posRanks(theirBoard, positionOf);

    const out: BoardDisagreement[] = [];
    for (const [pid, yourPosRank] of mine) {
      const theirPosRank = theirs.get(pid);
      if (theirPosRank == null) continue;
      const gap = theirPosRank - yourPosRank;
      if (gap === 0) continue;
      // Only surface disagreements where AT LEAST ONE side ranks the player as a
      // real asset at their position (top ~24 ≈ startable). Otherwise the list
      // fills with deep-bench noise where a 1-point rating wobble flips a rank.
      if (Math.min(yourPosRank, theirPosRank) > 24) continue;
      const p = playersMap.get(pid);
      if (!p || !p.position) continue;
      out.push({ playerId: pid, name: p.full_name, position: p.position, yourPosRank, theirPosRank, gap });
    }
    // Biggest disagreements first.
    out.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
    return { ready: true, active, disagreements: out.slice(0, 8) };
  }, [active, myBoard, theirBoard, playersMap]);
}
