import { useMemo } from 'react';
import { useTradeData } from './useLeagueData';
import { useActiveLeague } from '../lib/active-league';
import {
  buildPlayersForRoster,
  buildPicksForRoster,
  calcWeightedPositionValue,
} from '../lib/trade-shared';

export interface TeamStrength {
  rosterId: number;
  /** Weighted roster value (diminishing-returns positional weighting + picks). */
  value: number;
  /** 1-based rank by value across the league (1 = strongest). */
  rank: number;
}

/**
 * League-wide team strength: each roster's weighted YAP Value and its rank.
 * This is the single source for "how strong is this team" — the same
 * diminishing-returns weighting the Trade tools use — so Standings (Power
 * column) and any other surface agree instead of each recomputing it.
 *
 * Returns a Map keyed by roster_id plus the loading flag.
 */
export function useTeamStrength(): { byRoster: Map<number, TeamStrength>; isLoading: boolean } {
  // League page is league-scoped, so team strength follows the active league.
  const { activeLeagueId } = useActiveLeague();
  const { rosters, players, playerValues, pickValues, tradedPicks, isLoading } = useTradeData(activeLeagueId);

  const byRoster = useMemo(() => {
    const map = new Map<number, TeamStrength>();
    if (!rosters.length || !playerValues.size) return map;

    const totals = rosters.map((roster) => {
      const playerAssets = buildPlayersForRoster(roster, playerValues, players);
      const pickAssets = buildPicksForRoster(roster.roster_id, rosters, pickValues, tradedPicks);

      const byPosition: Record<string, { value: number }[]> = { QB: [], RB: [], WR: [], TE: [] };
      for (const asset of playerAssets) {
        if (asset.position && byPosition[asset.position]) byPosition[asset.position].push(asset);
      }
      const value =
        calcWeightedPositionValue(byPosition.QB, 'QB') +
        calcWeightedPositionValue(byPosition.RB, 'RB') +
        calcWeightedPositionValue(byPosition.WR, 'WR') +
        calcWeightedPositionValue(byPosition.TE, 'TE') +
        pickAssets.reduce((sum, a) => sum + a.value, 0);

      return { rosterId: roster.roster_id, value };
    });

    totals
      .sort((a, b) => b.value - a.value)
      .forEach((t, i) => map.set(t.rosterId, { rosterId: t.rosterId, value: t.value, rank: i + 1 }));

    return map;
  }, [rosters, players, playerValues, pickValues, tradedPicks]);

  return { byRoster, isLoading };
}
