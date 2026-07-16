import { useMemo } from 'react';
import { usePlayerMap } from './useLeagueData';
import { usePlayerValuesList } from './queries';
import { useValueMovers } from './detail';
import type { Mover } from '../components/BiggestMovers';

/**
 * Biggest risers & fallers across ALL players by community value over the given
 * window (default 30d) — league-agnostic, so it works with or without a league.
 * Deltas are measured base-to-base from value history; the displayed value is
 * the canonical value used elsewhere. Extracted from Home so the Players page
 * and any other surface share one definition.
 */
export function useGlobalMovers(daysAgo = 30): { risers: Mover[]; fallers: Mover[]; loading: boolean } {
  const { data: playersMap } = usePlayerMap();
  const { data: playerValues } = usePlayerValuesList();
  const { data: moverValues } = useValueMovers(daysAgo);

  const loading = !moverValues || !playersMap || !playerValues;

  const { risers, fallers } = useMemo(() => {
    if (!moverValues || !playersMap || !playerValues) return { risers: [] as Mover[], fallers: [] as Mover[] };
    const list: Mover[] = [];
    for (const [pid, curBase] of moverValues.current) {
      const past = moverValues.past.get(pid);
      if (!curBase || !past) continue;
      const delta = curBase - past;
      if (Math.abs(delta) < 100) continue; // ignore day-to-day noise
      const p = playersMap.get(pid);
      if (!p) continue;
      list.push({
        playerId: pid, name: p.full_name, position: p.position, team: p.team,
        value: playerValues.get(pid) || curBase, delta, pct: (delta / past) * 100, ownerTeam: '',
      });
    }
    return {
      risers: [...list].sort((a, b) => b.delta - a.delta).slice(0, 5),
      fallers: [...list].sort((a, b) => a.delta - b.delta).slice(0, 5),
    };
  }, [moverValues, playersMap, playerValues]);

  return { risers, fallers, loading };
}
