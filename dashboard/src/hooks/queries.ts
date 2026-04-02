import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Player, PlayerValue, PickValue, Roster } from '../types/domain';

// ── Query Key Factory ─────────────────────────────────────────────

export const queryKeys = {
  league: () => ['league'] as const,
  leagueIds: () => ['leagueIds'] as const,
  players: () => ['players'] as const,
  playerValues: () => ['playerValues'] as const,
  pickValues: () => ['pickValues'] as const,
  rosters: (leagueId: string | undefined) => ['rosters', leagueId] as const,
  transactions: (leagueId: string | undefined) => ['transactions', leagueId] as const,
  tradedPicks: (leagueId: string | undefined) => ['tradedPicks', leagueId] as const,
  matchups: (leagueId: string | undefined, week: number) => ['matchups', leagueId, week] as const,
  drafts: () => ['drafts'] as const,
  syncLogs: () => ['syncLogs'] as const,
  cronJobs: () => ['cronJobs'] as const,
  cronRuns: () => ['cronRuns'] as const,
  nflState: () => ['nflState'] as const,
};

// ── Base Query Hooks ──────────────────────────────────────────────

export function useLeague() {
  return useQuery({
    queryKey: queryKeys.league(),
    queryFn: async () => {
      const { data } = await supabase
        .from('leagues')
        .select('*')
        .order('season', { ascending: false })
        .limit(1);
      return data?.[0] ?? null;
    },
  });
}

export function useLeagueIds() {
  return useQuery({
    queryKey: queryKeys.leagueIds(),
    queryFn: async () => {
      const { data } = await supabase
        .from('leagues')
        .select('league_id')
        .order('season', { ascending: false })
        .limit(2);
      return {
        current: data?.[0]?.league_id ?? null,
        previous: data?.[1]?.league_id ?? null,
      };
    },
  });
}

export function usePlayers() {
  return useQuery({
    queryKey: queryKeys.players(),
    queryFn: async () => {
      const { data } = await supabase
        .from('players')
        .select('player_id, full_name, position, team');
      return (data || []) as Player[];
    },
  });
}

export function usePlayerValues() {
  return useQuery({
    queryKey: queryKeys.playerValues(),
    queryFn: async () => {
      const { data } = await supabase
        .from('player_values')
        .select('player_id, value, player:players(full_name, position, team)');
      const valueMap = new Map<string, PlayerValue>();
      for (const pv of data || []) {
        const player = Array.isArray(pv.player) ? pv.player[0] : pv.player;
        if (player) {
          valueMap.set(pv.player_id, {
            player_id: pv.player_id,
            value: pv.value,
            player: player as PlayerValue['player'],
          });
        }
      }
      return valueMap;
    },
  });
}

export function usePlayerValuesList() {
  return useQuery({
    queryKey: [...queryKeys.playerValues(), 'list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('player_values')
        .select('player_id, value');
      const map = new Map<string, number>();
      for (const pv of data || []) {
        map.set(pv.player_id, pv.value);
      }
      return map;
    },
  });
}

export function usePickValues() {
  return useQuery({
    queryKey: queryKeys.pickValues(),
    queryFn: async () => {
      const { data } = await supabase
        .from('pick_values')
        .select('pick_year, pick_round, pick_tier, value');
      return (data || []) as PickValue[];
    },
  });
}

export function useRosters(leagueId: string | null | undefined, previousLeagueId?: string | null) {
  return useQuery({
    queryKey: queryKeys.rosters(leagueId ?? undefined),
    enabled: !!leagueId,
    queryFn: async () => {
      const { data: rostersData } = await supabase
        .from('rosters')
        .select('*')
        .eq('league_id', leagueId!);
      const { data: users } = await supabase.from('users').select('*');
      const { data: leagueUsers } = await supabase
        .from('league_users')
        .select('user_id, team_name, display_name');
      if (!rostersData?.length) return [];

      // Check if current season has started (all zeros = offseason)
      const allZero = rostersData.every(r => (r.wins || 0) === 0 && (r.losses || 0) === 0);
      let prevStandings: Map<string, { wins: number; losses: number; fpts: number }> | null = null;

      if (allZero && previousLeagueId) {
        const { data: prevRosters } = await supabase
          .from('rosters')
          .select('owner_id, wins, losses, fpts')
          .eq('league_id', previousLeagueId);
        if (prevRosters?.length) {
          prevStandings = new Map();
          for (const pr of prevRosters) {
            prevStandings.set(pr.owner_id || '', {
              wins: pr.wins || 0,
              losses: pr.losses || 0,
              fpts: Number(pr.fpts) || 0,
            });
          }
        }
      }

      return rostersData.map(roster => {
        const lu = leagueUsers?.find(u => u.user_id === roster.owner_id);
        const owner = users?.find(u => u.user_id === roster.owner_id);
        const prev = prevStandings?.get(roster.owner_id || '');
        return {
          roster_id: roster.roster_id,
          owner_id: roster.owner_id || '',
          players: roster.players || [],
          wins: prev ? prev.wins : roster.wins || 0,
          losses: prev ? prev.losses : roster.losses || 0,
          fpts: prev ? prev.fpts : Number(roster.fpts) || 0,
          ownerName: lu?.team_name || lu?.display_name || owner?.display_name || owner?.username || 'Unknown',
          teamName: lu?.team_name || null,
        } satisfies Roster;
      });
    },
  });
}

export function useTradedPicks(leagueId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.tradedPicks(leagueId ?? undefined),
    enabled: !!leagueId,
    queryFn: async () => {
      const { data } = await supabase
        .from('traded_picks')
        .select('season, round, roster_id, owner_id')
        .eq('league_id', leagueId!);
      return data || [];
    },
  });
}
