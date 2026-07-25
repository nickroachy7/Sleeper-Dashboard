import { useMemo } from 'react';
import { useAuth } from '../lib/auth';
import { useMyBoard } from './useMyBoard';
import { usePlayerValuesList } from './queries';
import { usePlayerMap } from './useLeagueData';
import { isPickAsset } from '../lib/vote-assets';

// ── Your take vs the crowd ───────────────────────────────────────────────────
// The spine of the product is the TENSION between a user's ranking and the
// community's. This hook makes that tension available anywhere a player is
// shown — a player row, the detail header, the feed — as a single per-player
// lookup, so the app can say "You: WR4 · Crowd WR9" without each surface
// re-deriving the comparison.
//
// Everything here is client-side: the user's board (user_player_ratings, public
// read) blended the same way the profile board is, vs the live community values
// (player_values). No schema change, no extra round-trip beyond the two queries
// the app already runs.
//
// POSITION rank is the unit — it's what a manager actually argues ("I'm higher
// on this WR than the field"), and it's stable across the offense/IDP value-curve
// split that makes the overall rank ambiguous.

export interface TakeVsCrowd {
  /** The player's position (QB/RB/WR/TE/…); null for picks/unknown. */
  position: string | null;
  /** The user's own position rank (1 = their PosN). */
  yourPosRank: number;
  /** The community's position rank for this player. */
  crowdPosRank: number;
  /** crowdPosRank − yourPosRank: positive ⇒ you're HIGHER than the crowd. */
  posRankDelta: number;
  /** Whether the user has expressed any opinion on this player (rating ≠ 1500). */
  moved: boolean;
}

export interface TakeVsCrowdResult {
  /** True once the user is signed in and their board has loaded. */
  ready: boolean;
  /** Per-player comparison; null for guests, picks, or players off the board. */
  lookup: (playerId: string) => TakeVsCrowd | null;
}

const EMPTY: TakeVsCrowdResult = { ready: false, lookup: () => null };

/** Rank players within each position by a value accessor, descending. Returns a
 *  Map<player_id, positionRank> where the top player at a position is rank 1.
 *  Exported for unit testing — the correctness of the take-vs-crowd delta rides
 *  entirely on this being a stable, tie-broken positional ranking. */
export function positionRanks(
  ids: string[],
  positionOf: (id: string) => string | null,
  valueOf: (id: string) => number,
): Map<string, number> {
  const byPos = new Map<string, string[]>();
  for (const id of ids) {
    const pos = positionOf(id);
    if (!pos) continue;
    const arr = byPos.get(pos) ?? [];
    arr.push(id);
    byPos.set(pos, arr);
  }
  const out = new Map<string, number>();
  for (const [, arr] of byPos) {
    arr.sort((a, b) => valueOf(b) - valueOf(a));
    arr.forEach((id, i) => out.set(id, i + 1));
  }
  return out;
}

export function useTakeVsCrowd(): TakeVsCrowdResult {
  const { user } = useAuth();
  const { data: board } = useMyBoard(user?.id);
  const { data: communityValues } = usePlayerValuesList();
  const { data: playersMap } = usePlayerMap();

  return useMemo(() => {
    if (!user || !board || !communityValues || !playersMap || board.length === 0) return EMPTY;

    const positionOf = (id: string) => playersMap.get(id)?.position ?? null;

    // Crowd position ranks over every valued player (skip picks — no position).
    const crowdIds = [...communityValues.keys()].filter((id) => !isPickAsset(id) && positionOf(id));
    const crowdPosRank = positionRanks(crowdIds, positionOf, (id) => communityValues.get(id) ?? 0);

    // The user's position ranks, in THEIR board order (blended value).
    const boardIds = board.map((r) => r.player_id).filter((id) => !isPickAsset(id) && positionOf(id));
    const blendedById = new Map(board.map((r) => [r.player_id, r.blended]));
    const yourPosRank = positionRanks(boardIds, positionOf, (id) => blendedById.get(id) ?? 0);
    const movedById = new Map(board.map((r) => [r.player_id, r.moved]));

    const lookup = (playerId: string): TakeVsCrowd | null => {
      const position = positionOf(playerId);
      if (!position) return null;
      const yr = yourPosRank.get(playerId);
      const cr = crowdPosRank.get(playerId);
      if (yr == null || cr == null) return null;
      return {
        position,
        yourPosRank: yr,
        crowdPosRank: cr,
        posRankDelta: cr - yr,
        moved: movedById.get(playerId) ?? false,
      };
    };

    return { ready: true, lookup };
  }, [user, board, communityValues, playersMap]);
}
