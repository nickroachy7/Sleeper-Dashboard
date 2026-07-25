import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { VALUE_SOURCE } from '../lib/value-source';
import { useAuth } from '../lib/auth';
import { useMyBoard } from './useMyBoard';
import { usePlayerMap } from './useLeagueData';
import { fetchAllRows } from './queries';
import { ELO_BASE } from '../lib/board';

// ── "Since you were away" — the return hook ──────────────────────────────────
// The spine's whole payoff is: did the crowd move TOWARD my take, or AWAY from
// it, while I was gone? That question is the reason to open the app on a given
// day. We answer it client-side today (no notification infra): a per-user
// "last seen" timestamp in localStorage + public value history, scoped to the
// players the user actually has an opinion on.
//
// This is deliberately the SAME computation a server-side notification job would
// run later — when we add a notifications table, this hook's core moves to the
// server and starts producing pings instead of an in-app strip.

const LAST_SEEN_PREFIX = 'yap.whatsnew.lastSeen.';
// Don't look back further than this even on a long absence — "since you were
// away" should feel recent, not a season recap.
const MAX_LOOKBACK_DAYS = 21;
// Ignore sub-noise community moves (matches the movers threshold elsewhere).
const MIN_MOVE = 60;

export interface WhatsNewItem {
  playerId: string;
  name: string;
  position: string | null;
  team: string | null;
  /** Community value change since last seen (signed). */
  crowdMove: number;
  /** True when the crowd moved in the SAME direction as the user's take
   *  (user is high on the player and the crowd rose, or low and it fell). */
  towardYou: boolean;
  /** The user's Elo lean on this player (>0 = higher than neutral). */
  yourLean: number;
}

export interface WhatsNew {
  /** ISO timestamp of the previous visit this summary covers; null on first visit. */
  since: string | null;
  /** Players the user has a take on that the crowd moved since `since`. */
  items: WhatsNewItem[];
  /** Persist "seen now" so the next visit's window starts here. */
  markSeen: () => void;
}

function readLastSeen(userId: string): string | null {
  try { return localStorage.getItem(LAST_SEEN_PREFIX + userId); } catch { return null; }
}
function writeLastSeen(userId: string, iso: string) {
  try { localStorage.setItem(LAST_SEEN_PREFIX + userId, iso); } catch { /* ignore quota */ }
}

/**
 * Summary of how the community moved on the signed-in user's opinions since
 * their last visit. Empty (and inert) for guests, users with no board, or a
 * first visit. Does not auto-mark-seen — the surface calls markSeen() when the
 * user dismisses/acknowledges, so a summary isn't lost to an accidental load.
 */
export function useWhatsNew(): WhatsNew {
  const { user } = useAuth();
  const { data: board } = useMyBoard(user?.id);
  const { data: playersMap } = usePlayerMap();

  // Players the user has actually formed a take on — the only ones worth
  // reporting crowd movement for. (rating ≠ neutral.)
  const movedRows = useMemo(
    () => (board ?? []).filter((r) => r.rating !== ELO_BASE && !r.player_id.startsWith('PICK:')),
    [board]
  );

  const userId = user?.id ?? null;
  const lastSeen = userId ? readLastSeen(userId) : null;

  // Stable list of the ids we care about — the query keys off this, not the
  // whole board, so it only refetches when the SET of takes changes.
  const movedIds = useMemo(() => movedRows.map((r) => r.player_id).sort(), [movedRows]);

  // Fetch ONLY the crowd's value-move (first vs last in-window) for the players
  // the user has a take on. Scoped with `.in()` so it's a small, deterministic
  // query — not a full-history scan. Name resolution happens OUTSIDE the query
  // (below), against the live playersMap, so it can't race an empty map. The
  // window is clamped inside the queryFn (Date.now() is impure — not allowed in
  // render/useMemo per the React rules).
  const { data: moves } = useQuery({
    queryKey: ['whats-new-moves', userId, lastSeen, movedIds.join(',')],
    enabled: !!userId && movedIds.length > 0 && !!lastSeen,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, number>> => {
      const ms = Math.max(new Date(lastSeen!).getTime(), Date.now() - MAX_LOOKBACK_DAYS * 86_400_000);
      const sinceDate = new Date(ms).toISOString().slice(0, 10);
      const rows = await fetchAllRows<{ player_id: string; date: string; value: number }>((from, to) =>
        supabase
          .from('player_value_history')
          .select('player_id, date, value')
          .eq('source', VALUE_SOURCE)
          .gte('date', sinceDate)
          .in('player_id', movedIds)
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
      for (const id of first.keys()) {
        const f = first.get(id)!, l = last.get(id)!;
        move.set(id, l - f);
      }
      return move;
    },
  });

  const items = useMemo<WhatsNewItem[]>(() => {
    if (!moves || !playersMap) return [];
    const leanById = new Map(movedRows.map((r) => [r.player_id, r.rating - ELO_BASE]));
    const out: WhatsNewItem[] = [];
    for (const [pid, crowdMove] of moves) {
      if (Math.abs(crowdMove) < MIN_MOVE) continue;
      const p = playersMap.get(pid);
      if (!p) continue;
      const lean = leanById.get(pid) ?? 0;
      out.push({
        playerId: pid,
        name: p.full_name,
        position: p.position ?? null,
        team: p.team ?? null,
        crowdMove,
        towardYou: (lean > 0 && crowdMove > 0) || (lean < 0 && crowdMove < 0),
        yourLean: lean,
      });
    }
    out.sort((a, b) => Math.abs(b.crowdMove) - Math.abs(a.crowdMove));
    return out.slice(0, 6);
  }, [moves, playersMap, movedRows]);

  return {
    since: lastSeen,
    items,
    markSeen: () => { if (userId) writeLastSeen(userId, new Date().toISOString()); },
  };
}
