import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { VALUE_SOURCE } from '../lib/value-source';
import { isPickAsset } from '../lib/vote-assets';

// ── Enriched detail for the two assets in the current matchup ────────────────
// The base voting pool only carries {player_id, full_name, position, team}. To
// let a user make an INFORMED "who'd you rather" call — not a guess on a name
// they half-know — we fetch the richer fields + recent value history for just
// the two assets on screen. Two assets at a time keeps this tiny (one players
// row + a short history window each), so it can run on every matchup.

export interface AssetDetail {
  age: number | null;
  years_exp: number | null;
  injury_status: string | null;
  status: string | null;
  /** Recent community value history (ascending by date) for the sparkline. */
  history: { date: string; value: number }[];
  /** 30-day change derived from history (null when we lack two endpoints). */
  trend30: number | null;
}

const EMPTY: AssetDetail = { age: null, years_exp: null, injury_status: null, status: null, history: [], trend30: null };

async function fetchOne(playerId: string): Promise<AssetDetail> {
  // Picks have no players row and no per-pick value history — nothing to
  // enrich, so skip the fetch and let the card lean on value/name/label.
  if (isPickAsset(playerId)) return EMPTY;
  // ~90 days of history is plenty for a sparkline and a 30d delta, and stays
  // far under the row cap for a single player.
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const [{ data: player }, { data: history }] = await Promise.all([
    supabase.from('players').select('age, years_exp, injury_status, status').eq('player_id', playerId).maybeSingle(),
    supabase
      .from('player_value_history')
      .select('date, value')
      .eq('player_id', playerId)
      .eq('source', VALUE_SOURCE)
      .gte('date', since.toISOString().slice(0, 10))
      .order('date', { ascending: true }),
  ]);

  const hist = (history ?? []) as { date: string; value: number }[];
  // 30-day trend: newest value minus the value closest to 30 days ago.
  let trend30: number | null = null;
  if (hist.length >= 2) {
    const newest = hist[hist.length - 1].value;
    const target = new Date();
    target.setDate(target.getDate() - 30);
    const targetStr = target.toISOString().slice(0, 10);
    // First point on/after the 30d-ago mark; fall back to the oldest we have.
    const past = hist.find((h) => h.date >= targetStr) ?? hist[0];
    trend30 = newest - past.value;
  }

  return {
    age: player?.age ?? null,
    years_exp: player?.years_exp ?? null,
    injury_status: player?.injury_status ?? null,
    status: player?.status ?? null,
    history: hist,
    trend30,
  };
}

/**
 * Enriched detail for both assets of the current matchup. Player ids only for
 * now; picks (which have no players row or per-pick history) resolve to EMPTY
 * and lean on the value/name the pool already carries.
 */
export function usePairDetails(idA: string | undefined, idB: string | undefined) {
  return useQuery({
    queryKey: ['pair-details', idA, idB],
    enabled: !!idA && !!idB,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<{ a: AssetDetail; b: AssetDetail }> => {
      const [a, b] = await Promise.all([
        idA ? fetchOne(idA) : Promise.resolve(EMPTY),
        idB ? fetchOne(idB) : Promise.resolve(EMPTY),
      ]);
      return { a, b };
    },
  });
}
