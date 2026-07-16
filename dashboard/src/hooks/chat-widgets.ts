import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ── Chat widget data ──────────────────────────────────────────────
// The chatbot's generative-UI widgets pass only player_ids; the client
// fetches the live data to render (community value, rank, age, recent PPG).
// One shared hook keeps every widget consistent and cached.

export interface WidgetPlayer {
  player_id: string;
  full_name: string;
  position: string | null;
  team: string | null;
  age: number | null;
  injury_status: string | null;
  value: number | null;
  rank: number | null;
  position_rank: number | null;
  trend: number | null;
  /** Latest-season fantasy points per game from nflverse facts. */
  ppg: number | null;
  ppg_season: number | null;
}

/** Fetch render-ready data for a set of players by id (community superflex
 *  values + latest production). Returns a Map keyed by player_id. */
export function useWidgetPlayers(ids: string[]) {
  const sorted = [...ids].sort();
  return useQuery({
    queryKey: ['widgetPlayers', sorted],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, WidgetPlayer>> => {
      const [{ data: players }, { data: values }, { data: facts }] = await Promise.all([
        supabase
          .from('players')
          .select('player_id, full_name, position, team, age, injury_status')
          .in('player_id', ids),
        supabase
          .from('player_values')
          .select('player_id, value, rank, position_rank, trend')
          .eq('source', 'community')
          .eq('superflex', true)
          .in('player_id', ids),
        supabase
          .from('player_facts')
          .select('player_id, season, fantasy_ppg')
          .in('player_id', ids),
      ]);

      const valueById = new Map((values ?? []).map((v) => [v.player_id, v]));

      // Keep only the latest season's fact per player.
      const factById = new Map<string, { season: number; fantasy_ppg: number | null }>();
      for (const f of facts ?? []) {
        const prev = factById.get(f.player_id);
        if (!prev || (f.season ?? 0) > prev.season) {
          factById.set(f.player_id, { season: f.season, fantasy_ppg: f.fantasy_ppg });
        }
      }

      const map = new Map<string, WidgetPlayer>();
      for (const p of players ?? []) {
        const v = valueById.get(p.player_id);
        const f = factById.get(p.player_id);
        map.set(p.player_id, {
          player_id: p.player_id,
          full_name: p.full_name ?? p.player_id,
          position: p.position,
          team: p.team,
          age: p.age,
          injury_status: p.injury_status,
          value: v?.value ?? null,
          rank: v?.rank ?? null,
          position_rank: v?.position_rank ?? null,
          trend: v?.trend ?? null,
          ppg: f?.fantasy_ppg ?? null,
          ppg_season: f?.season ?? null,
        });
      }
      return map;
    },
  });
}
