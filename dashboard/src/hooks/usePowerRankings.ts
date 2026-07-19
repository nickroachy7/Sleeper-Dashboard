import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useLeague, usePlayerValuesList } from './queries';
import { usePlayerMap, useTradeData } from './useLeagueData';
import type { MyTeamStanding } from '../components/MyTeamCard';
import {
  calcWeightedPositionValue,
  buildPicksForRoster,
  POSITION_WEIGHT_TIERS,
  type RosterPosition,
} from '../lib/trade-shared';

/**
 * Value-based power rankings for the active league's current season — each
 * roster's weighted player value + pick value, ranked. Feeds MyTeamCard's
 * rank/roster-value stats (used on the League page; extracted from Home when
 * the card moved there).
 */
export function usePowerRankings(): MyTeamStanding[] {
  const { data: league } = useLeague();
  const { data: playersMap } = usePlayerMap();
  const { data: playerValues } = usePlayerValuesList();
  const { rosters: tradeRosters, pickValues, tradedPicks } = useTradeData();

  const { data: rosters } = useQuery({
    queryKey: ['power-rankings-rosters', league?.league_id],
    queryFn: async () => {
      const { data } = await supabase.from('rosters').select('*').eq('league_id', league!.league_id);
      return data ?? [];
    },
    enabled: !!league,
  });

  return useMemo<MyTeamStanding[]>(() => {
    if (!rosters || !playerValues || !playersMap) return [];
    return rosters
      .map((roster) => {
        const playerIds: string[] = roster.players || [];
        const positionGroups: Record<string, { value: number }[]> = {};
        playerIds.forEach((pid: string) => {
          const val = playerValues.get(pid) || 0;
          const p = playersMap.get(pid);
          if (p && p.position in POSITION_WEIGHT_TIERS) {
            (positionGroups[p.position] ??= []).push({ value: val });
          }
        });
        let totalValue = 0;
        for (const pos of Object.keys(POSITION_WEIGHT_TIERS) as RosterPosition[]) {
          totalValue += calcWeightedPositionValue(positionGroups[pos] || [], pos);
        }
        if (pickValues.length) {
          const pickAssets = buildPicksForRoster(roster.roster_id, tradeRosters, pickValues, tradedPicks);
          totalValue += pickAssets.reduce((sum, a) => sum + a.value, 0);
        }
        return { rosterId: roster.roster_id, totalValue, wins: roster.wins ?? 0, losses: roster.losses ?? 0 };
      })
      .sort((a, b) => b.totalValue - a.totalValue)
      .map((team, idx) => ({ ...team, rank: idx + 1 }));
  }, [rosters, playerValues, playersMap, tradeRosters, pickValues, tradedPicks]);
}
