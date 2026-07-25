import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAllRows, usePlayerValuesList } from './queries';
import { usePlayerMap } from './useLeagueData';
import { playerMoves, txDraftPicks } from '../lib/trade-shared';
import { pickLabel, pickAssetId } from '../lib/vote-assets';
import type { TransactionRow } from '../types/domain';

// Just the columns this hook selects (a partial TransactionRow).
type TradeRow = Pick<TransactionRow, 'transaction_id' | 'league_id' | 'adds' | 'drops' | 'draft_picks' | 'created' | 'roster_ids'>;

// ── Real comparable trades ───────────────────────────────────────────────────
// The trust play: ground a player's value in what managers ACTUALLY did, not
// just the model. Across every synced league (711+ complete trades), find the
// real trades this player was moved in and show what came back the other way.
// A KTC-style tool can't do this — it has no record of real trades.
//
// All public data (transactions), fetched once and shared. A trade is "about"
// this player if they appear in adds (someone received them). The RETURN side is
// everything the other roster received in the same deal, summarized by top
// value so the row reads "Player ⇄ Best asset back (+N more)".

export interface ComparableAsset {
  label: string;
  playerId: string | null;
  value: number;
}

export interface ComparableTrade {
  transactionId: string;
  leagueId: string;
  created: number;
  /** What the manager who received the target player gave up (the return). */
  returned: ComparableAsset[];
  /** Total community value of the return package (for a rough "what he fetched"). */
  returnValue: number;
}

/** All complete trades, cached app-wide (cross-league). One fetch feeds every
 *  player's comparables. */
function useAllCompleteTrades() {
  return useQuery({
    queryKey: ['all-complete-trades'],
    staleTime: 15 * 60_000,
    queryFn: async (): Promise<TradeRow[]> =>
      fetchAllRows<TradeRow>((from, to) =>
        supabase
          .from('transactions')
          .select('transaction_id, league_id, adds, drops, draft_picks, created, roster_ids')
          .eq('type', 'trade')
          .eq('status', 'complete')
          .order('created', { ascending: false })
          .range(from, to)
      ),
  });
}

export function useComparableTrades(playerId: string | undefined, limit = 5) {
  const { data: trades } = useAllCompleteTrades();
  const { data: valueMap } = usePlayerValuesList();
  const { data: playersMap } = usePlayerMap();

  const comparables = useMemo<ComparableTrade[]>(() => {
    if (!playerId || !trades || !(valueMap instanceof Map) || !playersMap) return [];
    const out: ComparableTrade[] = [];

    for (const t of trades) {
      const adds = playerMoves(t.adds); // {player_id: receiving_roster_id}
      const receivingRoster = adds[playerId];
      if (receivingRoster == null) continue; // this player wasn't received in this trade

      // The return = everything the OTHER side(s) received — i.e. every added
      // asset that went to a DIFFERENT roster than the one who got our player,
      // plus draft picks routed elsewhere.
      const returned: ComparableAsset[] = [];
      for (const [pid, rid] of Object.entries(adds)) {
        if (pid === playerId || rid === receivingRoster) continue;
        const p = playersMap.get(pid);
        returned.push({
          label: p?.full_name ?? pid,
          playerId: pid,
          value: valueMap.get(pid) ?? 0,
        });
      }
      for (const dp of txDraftPicks(t.draft_picks)) {
        if (dp.owner_id === receivingRoster) continue; // stayed with our player's side
        const id = pickAssetId(dp.season, dp.round);
        returned.push({ label: pickLabel(id), playerId: null, value: valueMap.get(id) ?? 0 });
      }
      if (!returned.length) continue; // a one-sided/odd trade — skip

      returned.sort((a, b) => b.value - a.value);
      out.push({
        transactionId: t.transaction_id,
        leagueId: t.league_id,
        created: t.created ?? 0,
        returned,
        returnValue: returned.reduce((s, a) => s + a.value, 0),
      });
    }

    // Most recent first — recency is the most useful ordering for "market read".
    out.sort((a, b) => b.created - a.created);
    return out.slice(0, limit);
  }, [playerId, trades, valueMap, playersMap, limit]);

  return comparables;
}
