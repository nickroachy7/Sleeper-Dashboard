import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { VALUE_SOURCE } from '../lib/value-source';
import { usePlayerMap } from './useLeagueData';
import { fetchAllRows } from './queries';
import { ELO_BASE } from '../lib/board';

// ── "Called it" — takes the crowd came around to ─────────────────────────────
// The status payoff of having opinions: a take is "called" when the user leaned
// a player a direction (up or down vs the crowd) and the community LATER moved
// the same way. Being early is the flex. Derived entirely from public data:
// the profile's board rows (rating lean) + recent community value history.
//
// This powers the profile "Called it" count and list. It's the per-user,
// read-only ancestor of the global Hot-Takes leaderboard (Phase 2a global),
// which needs cross-user aggregation and is staged as a migration.

const WINDOW_DAYS = 30;
// A take only "counts" once the user has a real lean and the crowd made a real
// move — filter noise on both sides.
const MIN_LEAN = 24;   // ~1.5 votes of Elo deviation
const MIN_MOVE = 80;   // community value points

export interface CalledItItem {
  playerId: string;
  name: string;
  position: string | null;
  team: string | null;
  /** The user's Elo lean (>0 = higher than the crowd). */
  lean: number;
  /** The community's value move over the window (signed). */
  crowdMove: number;
}

export interface CalledItResult {
  loading: boolean;
  /** Takes the crowd moved TOWARD (user was early), biggest move first. */
  called: CalledItItem[];
  /** How many takes were "called" — the headline count. */
  count: number;
}

interface BoardRow { player_id: string; rating: number; }

/**
 * Score a profile's board for "called it" takes. Takes an explicit board (the
 * profile page already loads user_player_ratings) so it doesn't re-fetch; pass
 * the same rows the board renders from.
 */
export function useCalledIt(board: BoardRow[] | undefined): CalledItResult {
  const { data: playersMap } = usePlayerMap();

  // The players this user has leaned on — the only candidates for a "call".
  const leaned = useMemo(
    () =>
      (board ?? [])
        .filter((r) => Math.abs(r.rating - ELO_BASE) >= MIN_LEAN && !r.player_id.startsWith('PICK:'))
        .map((r) => ({ player_id: r.player_id, lean: r.rating - ELO_BASE })),
    [board]
  );
  const ids = useMemo(() => leaned.map((l) => l.player_id).sort(), [leaned]);

  const { data: moves, isLoading } = useQuery({
    queryKey: ['called-it-moves', ids.join(',')],
    enabled: ids.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Map<string, number>> => {
      const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
      const rows = await fetchAllRows<{ player_id: string; date: string; value: number }>((from, to) =>
        supabase
          .from('player_value_history')
          .select('player_id, date, value')
          .eq('source', VALUE_SOURCE)
          .gte('date', since)
          .in('player_id', ids)
          .order('date', { ascending: true })
          .range(from, to)
      );
      const first = new Map<string, number>();
      const last = new Map<string, number>();
      for (const r of rows) {
        if (!first.has(r.player_id)) first.set(r.player_id, r.value);
        last.set(r.player_id, r.value);
      }
      const move = new Map<string, number>();
      for (const id of first.keys()) move.set(id, last.get(id)! - first.get(id)!);
      return move;
    },
  });

  const called = useMemo(() => {
    if (!moves || !playersMap) return [];
    const out: CalledItItem[] = [];
    for (const { player_id, lean } of leaned) {
      const crowdMove = moves.get(player_id);
      if (crowdMove == null || Math.abs(crowdMove) < MIN_MOVE) continue;
      // "Called" = the crowd moved the SAME direction the user leaned.
      const aligned = (lean > 0 && crowdMove > 0) || (lean < 0 && crowdMove < 0);
      if (!aligned) continue;
      const p = playersMap.get(player_id);
      if (!p) continue;
      out.push({ playerId: player_id, name: p.full_name, position: p.position ?? null, team: p.team ?? null, lean, crowdMove });
    }
    out.sort((a, b) => Math.abs(b.crowdMove) - Math.abs(a.crowdMove));
    return out;
  }, [moves, playersMap, leaned]);

  return { loading: isLoading, called, count: called.length };
}
