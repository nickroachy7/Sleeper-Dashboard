import { useCallback, useMemo } from 'react';
import { usePlayers, usePlayerValuesList } from './queries';
import type { CompareSide } from '../components/PlayerVersus';
import type { AssetDetail } from './usePairDetails';
import type { Player } from '../types/domain';

// Shared CompareSide builder for the PlayerVersus vote card. Derives overall +
// position rank from the community value list once (the same "#12 · WR4" context
// Rank 'Em, the feed vote CTAs, and the Daily Five all show), so those surfaces
// don't each re-implement the ranking.
export function useCompareSide() {
  const { data: players } = usePlayers();
  const { data: playerValues } = usePlayerValuesList();

  const { overallRank, positionRank } = useMemo(() => {
    const overall = new Map<string, number>();
    const posRank = new Map<string, number>();
    if (!(playerValues instanceof Map) || !players) return { overallRank: overall, positionRank: posRank };
    const byId = new Map(players.map((p) => [p.player_id, p]));
    const posCount = new Map<string, number>();
    [...playerValues.entries()]
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .forEach(([pid], i) => {
        overall.set(pid, i + 1);
        const pos = byId.get(pid)?.position;
        if (pos) { const n = (posCount.get(pos) ?? 0) + 1; posCount.set(pos, n); posRank.set(pid, n); }
      });
    return { overallRank: overall, positionRank: posRank };
  }, [playerValues, players]);

  return useCallback(
    (p: Player, detail: AssetDetail | undefined): CompareSide => ({
      player: p,
      value: (playerValues instanceof Map ? playerValues.get(p.player_id) : null) || null,
      overallRank: overallRank.get(p.player_id) ?? null,
      positionRank: positionRank.get(p.player_id) ?? null,
      detail,
    }),
    [playerValues, overallRank, positionRank]
  );
}
