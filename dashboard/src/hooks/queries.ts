import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { sleeperApi } from '../lib/sleeper-api';
import { VALUE_SOURCE } from '../lib/value-source';
import { useActiveLeague } from '../lib/active-league';
import type { Player, PlayerValue, PickValue, Roster } from '../types/domain';

// ── Pagination ────────────────────────────────────────────────────
// PostgREST caps every response at 1000 rows. Tables that have grown past
// that (players is ~1150 and climbing as rookies are added) MUST be paged or
// the tail silently drops — which shows up as players rendering by raw id with
// a "?" badge because the name/position lookup missed. Page through in 1000s.
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null }>
): Promise<T[]> {
  const pageSize = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data } = await fetchPage(from, from + pageSize - 1);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}

// ── Query Key Factory ─────────────────────────────────────────────

export const queryKeys = {
  league: (activeId: string | null) => ['league', activeId] as const,
  leagueIds: (activeId: string | null) => ['leagueIds', activeId] as const,
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

// Resolve the active dynasty's season chain by walking `previous_league_id`
// from the active root league. When the visitor has NO active league
// (activeLeagueId null — a fresh public visitor), this returns a null current
// and an empty chain: no league data, so the app shows onboarding instead of
// defaulting to someone else's league.
export function useLeagueIds() {
  const { activeLeagueId } = useActiveLeague();
  return useQuery({
    queryKey: queryKeys.leagueIds(activeLeagueId),
    queryFn: async () => {
      if (!activeLeagueId) return { current: null, previous: null, chain: [] as string[] };

      const { data } = await supabase
        .from('leagues')
        .select('league_id, season, previous_league_id')
        .order('season', { ascending: false });
      const rows = data ?? [];
      const byId = new Map(rows.map((l) => [l.league_id, l]));

      // Walk the previous_league_id chain from the active root (guarding
      // against cycles / rows not yet synced).
      const chain: string[] = [];
      const seen = new Set<string>();
      let cursor: string | null = byId.has(activeLeagueId) ? activeLeagueId : null;
      while (cursor && byId.has(cursor) && !seen.has(cursor)) {
        seen.add(cursor);
        chain.push(cursor);
        cursor = byId.get(cursor)?.previous_league_id ?? null;
      }

      return {
        current: chain[0] ?? null,
        previous: chain[1] ?? null,
        chain,
      };
    },
  });
}

export interface NflState {
  season: string;
  seasonType: string;   // 'off' | 'pre' | 'regular' | 'post'
  week: number;
  displayWeek: number;
  /** No games that count yet — offseason or preseason. */
  isOffseason: boolean;
}

/**
 * Current NFL season/week from the synced nfl_state table, with a live fallback
 * to Sleeper. Drives offseason-aware UI so a season that hasn't kicked off isn't
 * shown as a played/ranked season. Refetched on an interval so the app flips to
 * in-season automatically when week 1 arrives.
 */
export function useNflState() {
  return useQuery({
    queryKey: queryKeys.nflState(),
    staleTime: 10 * 60_000,
    refetchInterval: 15 * 60_000,
    queryFn: async (): Promise<NflState> => {
      const { data } = await supabase
        .from('nfl_state')
        .select('season, season_type, week, display_week')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      let row = data;
      if (!row) {
        const s = await sleeperApi.getNflState();
        row = { season: s.season, season_type: s.season_type, week: s.week, display_week: s.display_week };
      }
      const seasonType = row.season_type ?? 'off';
      return {
        season: String(row.season),
        seasonType,
        week: row.week ?? 0,
        displayWeek: row.display_week ?? row.week ?? 0,
        isOffseason: seasonType === 'off' || seasonType === 'pre',
      };
    },
  });
}

export interface TrendingInfo {
  addCount: number;   // leagues that ADDED this player in the window (0 if not trending)
  dropCount: number;  // leagues that DROPPED this player
}

/**
 * Community-wide add/drop buzz from Sleeper, fetched once and shared. Returns a
 * lookup so any player page can show whether the wider Sleeper community is
 * buying or bailing on a player in the last 24h — a universal signal that works
 * logged-out. Cached for 30 min; a miss just means "not trending".
 */
export function useTrending() {
  return useQuery({
    queryKey: ['trending', '24h'],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const [add, drop] = await Promise.all([
        sleeperApi.getTrending('add', 24, 250).catch(() => []),
        sleeperApi.getTrending('drop', 24, 250).catch(() => []),
      ]);
      const addMap = new Map(add.map((r) => [r.player_id, r.count]));
      const dropMap = new Map(drop.map((r) => [r.player_id, r.count]));
      const lookup = (playerId: string): TrendingInfo => ({
        addCount: addMap.get(playerId) ?? 0,
        dropCount: dropMap.get(playerId) ?? 0,
      });
      return { addMap, dropMap, lookup };
    },
  });
}

export function useLeague() {
  const { activeLeagueId } = useActiveLeague();
  const { data: ids } = useLeagueIds();
  const currentLeagueId = ids?.current ?? null;
  return useQuery({
    queryKey: queryKeys.league(activeLeagueId),
    enabled: !!currentLeagueId,
    queryFn: async () => {
      const { data } = await supabase.from('leagues').select('*').eq('league_id', currentLeagueId!).single();
      return data ?? null;
    },
  });
}

export function usePlayers() {
  return useQuery({
    queryKey: queryKeys.players(),
    queryFn: async () => {
      const data = await fetchAllRows((from, to) =>
        supabase.from('players').select('player_id, full_name, position, team').range(from, to)
      );
      return data as Player[];
    },
  });
}

export function usePlayerValues() {
  return useQuery({
    queryKey: queryKeys.playerValues(),
    queryFn: async () => {
      const data = await fetchAllRows<{ player_id: string; value: number; player: unknown }>((from, to) =>
        supabase
          .from('player_values')
          .select('player_id, value, player:players(full_name, position, team)')
          .eq('source', VALUE_SOURCE)
          .range(from, to)
      );
      const valueMap = new Map<string, PlayerValue>();
      for (const pv of data) {
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
    structuralSharing: false, // Maps are not structurally shareable
  });
}

export function usePlayerValuesList() {
  return useQuery({
    queryKey: [...queryKeys.playerValues(), 'list'],
    queryFn: async () => {
      const data = await fetchAllRows<{ player_id: string; value: number }>((from, to) =>
        supabase.from('player_values').select('player_id, value').eq('source', VALUE_SOURCE).range(from, to)
      );
      const map = new Map<string, number>();
      for (const pv of data) {
        map.set(pv.player_id, pv.value);
      }
      return map;
    },
    structuralSharing: false, // Maps are not structurally shareable
  });
}

export function usePickValues() {
  return useQuery({
    queryKey: queryKeys.pickValues(),
    queryFn: async () => {
      const { data } = await supabase
        .from('pick_values')
        .select('pick_year, pick_round, pick_tier, value')
        .eq('source', VALUE_SOURCE);
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
