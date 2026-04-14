import { useMemo } from 'react';
import { usePlayers, usePlayerValues, useLeagueIds, useRosters, usePickValues, useTradedPicks } from './queries';
import type { Player, PlayerValue } from '../types/domain';

// ── Player Map ────────────────────────────────────────────────────
// Map<player_id, Player> for quick lookups

export function usePlayerMap() {
  const { data: players, ...rest } = usePlayers();
  const playerMap = useMemo(() => {
    const map = new Map<string, Player>();
    for (const p of players || []) {
      map.set(p.player_id, p);
    }
    return map;
  }, [players]);
  return { data: playerMap, ...rest };
}

// ── Full Trade Data ───────────────────────────────────────────────
// All the data needed for trade tools (TradeEvaluator, TradeFinder)

export function useTradeData() {
  const { data: leagueIds } = useLeagueIds();
  const currentLeagueId = leagueIds?.current;
  const previousLeagueId = leagueIds?.previous;

  const { data: rosters, isLoading: rostersLoading } = useRosters(currentLeagueId, previousLeagueId);
  const { data: players } = usePlayers();
  const { data: playerValues, isLoading: valuesLoading } = usePlayerValues();
  const { data: pickValues, isLoading: picksLoading } = usePickValues();
  const { data: tradedPicks } = useTradedPicks(currentLeagueId);

  const isLoading = rostersLoading || valuesLoading || picksLoading;

  return {
    leagueIds,
    currentLeagueId,
    rosters: rosters || [],
    players: players || [],
    playerValues: playerValues || new Map<string, PlayerValue>(),
    pickValues: pickValues || [],
    tradedPicks: tradedPicks || [],
    isLoading,
  };
}

