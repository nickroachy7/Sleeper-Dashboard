import { useMemo } from 'react';
import { usePlayers, usePlayerValuesList } from './queries';
import { useShowIdp } from '../lib/idp-store';
import { isVisiblePosition } from '../lib/positions';
import type { Player } from '../types/domain';

export interface VoteMatchup {
  id: string;
  a: Player;
  b: Player;
}

/**
 * Deterministic-per-render set of "who'd you rather keep?" matchups for the
 * feed's vote CTAs. Same nearby-value pairing as the Rank 'Em page (a genuine
 * coin-flip teaches the model more than a blowout), but produced as a stable
 * list so N CTAs can be interleaved into the feed without reshuffling on every
 * keystroke. `seed` (e.g. the feed length) varies the picks between mounts
 * without needing Math.random at render time.
 */
export function useVoteMatchups(count: number, seed = 0): VoteMatchup[] {
  const { data: players } = usePlayers();
  const { data: valueMap } = usePlayerValuesList();
  const showIdp = useShowIdp();

  return useMemo(() => {
    if (!players || !valueMap || count <= 0) return [];
    const pool = players
      .filter((p) => isVisiblePosition(p.position, showIdp) && valueMap.has(p.player_id))
      .sort((a, b) => (valueMap.get(b.player_id) ?? 0) - (valueMap.get(a.player_id) ?? 0));
    if (pool.length < 2) return [];

    const window = 12;
    const out: VoteMatchup[] = [];
    const used = new Set<string>();
    // Even, spread-out anchors across the value board so CTAs aren't all elites.
    const step = Math.max(1, Math.floor(pool.length / (count + 1)));
    for (let n = 0; n < count; n++) {
      const i = Math.min(pool.length - 1, (seed + (n + 1) * step) % pool.length);
      const a = pool[i];
      if (!a || used.has(a.player_id)) continue;
      const lo = Math.max(0, i - window);
      const hi = Math.min(pool.length - 1, i + window);
      // Nearest unused neighbor within the value window.
      let b: Player | null = null;
      for (let d = 1; d <= window; d++) {
        const cand = pool[i + d] && !used.has(pool[i + d].player_id) && (i + d) <= hi ? pool[i + d]
          : pool[i - d] && !used.has(pool[i - d].player_id) && (i - d) >= lo ? pool[i - d]
          : null;
        if (cand) { b = cand; break; }
      }
      if (!b) continue;
      used.add(a.player_id); used.add(b.player_id);
      out.push({ id: `${a.player_id}-${b.player_id}`, a, b });
    }
    return out;
  }, [players, valueMap, count, seed, showIdp]);
}
