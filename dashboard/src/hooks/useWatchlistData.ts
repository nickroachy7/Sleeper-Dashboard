import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { VALUE_SOURCE } from '../lib/value-source';
import { useWatchlist } from '../lib/watchlist';
import { usePlayerMap } from './useLeagueData';
import { usePlayerValuesList, fetchAllRows } from './queries';
import { isPickAsset, pickLabel, parsePickAsset } from '../lib/vote-assets';

// ── Watchlist data + move alerts ─────────────────────────────────────────────
// Resolves the watched asset ids (players + picks) into display rows with their
// current value and recent 7d/30d community move — so the watchlist reads as a
// live "targets" board, the beginning of the trade-tool loop: watch a target,
// see it move into range. Value moves come from public player_value_history and
// pick_values; no schema.

export interface WatchRow {
  id: string;
  isPick: boolean;
  name: string;
  position: string | null;
  team: string | null;
  value: number | null;
  d7: number | null;
  d30: number | null;
}

const WINDOW = 30;

export function useWatchlistData() {
  const ids = useWatchlist();
  const { data: playersMap } = usePlayerMap();
  const { data: valueMap } = usePlayerValuesList();

  const playerIds = useMemo(() => ids.filter((id) => !isPickAsset(id)), [ids]);

  // 7d/30d community moves for the watched PLAYERS (picks move on a coarser,
  // separate table; we show pick value without a delta for now).
  const { data: moves, isLoading } = useQuery({
    queryKey: ['watchlist-moves', playerIds.slice().sort().join(',')],
    enabled: playerIds.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Map<string, { d7: number | null; d30: number | null }>> => {
      const since = new Date(Date.now() - (WINDOW + 4) * 86_400_000).toISOString().slice(0, 10);
      const rows = await fetchAllRows<{ player_id: string; date: string; value: number }>((from, to) =>
        supabase
          .from('player_value_history')
          .select('player_id, date, value')
          .eq('source', VALUE_SOURCE)
          .gte('date', since)
          .in('player_id', playerIds)
          .order('date', { ascending: true })
          .range(from, to)
      );
      // Group by player; compute delta vs the row nearest 7 and 30 days back.
      const byPlayer = new Map<string, { date: string; value: number }[]>();
      for (const r of rows) {
        const arr = byPlayer.get(r.player_id) ?? [];
        arr.push({ date: r.date, value: r.value });
        byPlayer.set(r.player_id, arr);
      }
      const out = new Map<string, { d7: number | null; d30: number | null }>();
      for (const [pid, arr] of byPlayer) {
        const latest = arr[arr.length - 1];
        const asOf = (days: number) => {
          const target = new Date(latest.date);
          target.setUTCDate(target.getUTCDate() - days);
          const iso = target.toISOString().slice(0, 10);
          let hit: number | null = null;
          for (const r of arr) { if (r.date <= iso) hit = r.value; else break; }
          return hit;
        };
        const p7 = asOf(7), p30 = asOf(30);
        out.set(pid, {
          d7: p7 != null ? latest.value - p7 : null,
          d30: p30 != null ? latest.value - p30 : null,
        });
      }
      return out;
    },
  });

  const rows = useMemo<WatchRow[]>(() => {
    if (!playersMap || !(valueMap instanceof Map)) return [];
    return ids.map((id) => {
      if (isPickAsset(id)) {
        const parsed = parsePickAsset(id);
        return {
          id, isPick: true, name: pickLabel(id),
          position: 'PICK', team: null,
          value: parsed ? (valueMap.get(id) ?? null) : null,
          d7: null, d30: null,
        };
      }
      const p = playersMap.get(id);
      const mv = moves?.get(id);
      return {
        id, isPick: false,
        name: p?.full_name ?? id,
        position: p?.position ?? null,
        team: p?.team ?? null,
        value: valueMap.get(id) ?? null,
        d7: mv?.d7 ?? null,
        d30: mv?.d30 ?? null,
      };
    });
  }, [ids, playersMap, valueMap, moves]);

  return { rows, loading: isLoading && playerIds.length > 0, count: ids.length };
}
