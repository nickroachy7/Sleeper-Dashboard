import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { playerMoves } from '../lib/trade-shared';
import type { TransactionRow } from '../types/domain';

// ── Detail-page data hooks (player / team deep dives) ──────────────
// Kept separate from queries.ts so detail pages stay self-contained.

export interface HistoryPoint {
  date: string;
  value: number;
}

/** Page through PostgREST's 1000-row cap. */
async function fetchAllRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
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

function fetchAllTransactions(): Promise<TransactionRow[]> {
  return fetchAllRows<TransactionRow>((from, to) =>
    supabase.from('transactions').select('*').order('created', { ascending: false }).range(from, to)
  );
}

/** League directory: every season, roster, and team name in one cached blob. */
export function useLeagueDirectory() {
  return useQuery({
    queryKey: ['league-directory'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [{ data: leagues }, { data: rosters }, { data: users }, { data: leagueUsers }] =
        await Promise.all([
          supabase.from('leagues').select('league_id, season, name').order('season', { ascending: false }),
          supabase.from('rosters').select('league_id, roster_id, owner_id, players, wins, losses, ties, fpts, fpts_against'),
          supabase.from('users').select('user_id, display_name, username, avatar'),
          supabase.from('league_users').select('league_id, user_id, team_name, display_name'),
        ]);

      const seasonByLeague = new Map<string, string>();
      (leagues || []).forEach((l) => seasonByLeague.set(l.league_id, l.season));
      const currentLeagueId = leagues?.[0]?.league_id ?? null;

      const teamName = (rosterId: number, leagueId?: string | null): string => {
        const lid = leagueId || currentLeagueId;
        const roster = (rosters || []).find((r) => r.roster_id === rosterId && r.league_id === lid)
          || (rosters || []).find((r) => r.roster_id === rosterId && r.league_id === currentLeagueId);
        if (!roster?.owner_id) return `Team ${rosterId}`;
        const lu = (leagueUsers || []).find((u) => u.user_id === roster.owner_id && u.league_id === currentLeagueId)
          || (leagueUsers || []).find((u) => u.user_id === roster.owner_id);
        const user = (users || []).find((u) => u.user_id === roster.owner_id);
        return lu?.team_name || lu?.display_name || user?.display_name || user?.username || `Team ${rosterId}`;
      };

      return {
        leagues: leagues || [],
        rosters: rosters || [],
        users: users || [],
        leagueUsers: leagueUsers || [],
        currentLeagueId,
        seasonByLeague,
        teamName,
      };
    },
  });
}

/** All data for the player detail page. */
export function usePlayerDetail(playerId: string | undefined) {
  return useQuery({
    queryKey: ['player-detail', playerId],
    enabled: !!playerId,
    queryFn: async () => {
      const pid = playerId!;
      const [
        { data: player },
        { data: value },
        { data: history },
        { data: draftPicks },
        allTx,
        { data: owningRosters },
      ] = await Promise.all([
        supabase.from('players').select('*').eq('player_id', pid).maybeSingle(),
        supabase.from('player_values').select('*').eq('player_id', pid).maybeSingle(),
        supabase.from('player_value_history').select('date, value').eq('player_id', pid).order('date', { ascending: true }),
        supabase.from('draft_picks').select('*, drafts(season, league_id, type)').eq('player_id', pid),
        fetchAllTransactions(),
        supabase.from('rosters').select('league_id, roster_id, owner_id').contains('players', [pid]),
      ]);

      // PostgREST can't filter JSON keys that look like array indexes
      // (player ids are numeric strings), so filter client-side.
      const transactions = allTx
        .filter((t) => pid in playerMoves(t.adds) || pid in playerMoves(t.drops))
        .sort((a, b) => (b.created || 0) - (a.created || 0));

      return {
        player,
        value,
        history: (history || []) as HistoryPoint[],
        draftPicks: draftPicks || [],
        transactions,
        owningRosters: owningRosters || [],
      };
    },
  });
}

/** Sum of value history across a set of players (team value over time). */
export function useRosterValueHistory(playerIds: string[] | undefined) {
  const key = (playerIds || []).slice().sort().join(',');
  return useQuery({
    queryKey: ['roster-value-history', key],
    enabled: !!playerIds?.length,
    queryFn: async () => {
      const rows = await fetchAllRows<{ player_id: string; date: string; value: number }>((from, to) =>
        supabase
          .from('player_value_history')
          .select('player_id, date, value')
          .in('player_id', playerIds!)
          .order('date', { ascending: true })
          .range(from, to)
      );

      // Sum values per date across whichever players have data that day
      const byDate = new Map<string, number>();
      rows.forEach((row) => {
        byDate.set(row.date, (byDate.get(row.date) || 0) + row.value);
      });
      return [...byDate.entries()]
        .map(([date, value]) => ({ date, value }))
        .sort((a, b) => a.date.localeCompare(b.date)) as HistoryPoint[];
    },
  });
}

/** Latest value per player within a date window (most recent wins). */
function latestPerPlayer(rows: { player_id: string; date: string; value: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) if (!map.has(r.player_id)) map.set(r.player_id, r.value);
  return map;
}

/**
 * Current and ~`daysAgo`-old KTC values for every player, both read from
 * player_value_history so the two endpoints share one basis (base superflex).
 * This is what "biggest movers" compares — using the TEP player_values for the
 * current end would make every TE look like a riser vs. the base history.
 * Fetches two narrow date windows to stay well under the row cap.
 */
export function useValueMovers(daysAgo: number) {
  return useQuery({
    queryKey: ['value-movers', daysAgo],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const now = new Date();
      const recentLo = new Date(now); recentLo.setDate(recentLo.getDate() - 4);
      const past = new Date(now); past.setDate(past.getDate() - daysAgo);
      const pastLo = new Date(past); pastLo.setDate(pastLo.getDate() - 4);
      const pastHi = new Date(past); pastHi.setDate(pastHi.getDate() + 3);

      const win = (loStr: string, hiStr: string) =>
        fetchAllRows<{ player_id: string; date: string; value: number }>((from, to) =>
          supabase
            .from('player_value_history')
            .select('player_id, date, value')
            .gte('date', loStr)
            .lte('date', hiStr)
            .order('date', { ascending: false })
            .range(from, to)
        );

      const [recentRows, pastRows] = await Promise.all([
        win(fmt(recentLo), fmt(now)),
        win(fmt(pastLo), fmt(pastHi)),
      ]);

      return { current: latestPerPlayer(recentRows), past: latestPerPlayer(pastRows) };
    },
  });
}

/**
 * A single trade by transaction_id, plus `latestValue`: the most-recent
 * player_value_history value per player involved, used as a fallback when a
 * player is missing from the (TEP) player_values table so trade rows and side
 * totals still show a number.
 *
 * Note on picks: we intentionally do NOT resolve a traded pick to the player
 * eventually drafted with it. That requires a reliable draft slot → original
 * owner map, and the synced draft data doesn't have one — `slot_to_roster_id`
 * is null and `draft_order` is incomplete for past drafts — so any attribution
 * would be partial and could be wrong. Picks render as picks until the draft
 * sync is fixed to populate slot_to_roster_id.
 */
export function useTradeDetail(transactionId: string | undefined) {
  return useQuery({
    queryKey: ['trade-detail', transactionId],
    enabled: !!transactionId,
    queryFn: async () => {
      const { data: transaction } = await supabase
        .from('transactions')
        .select('*')
        .eq('transaction_id', transactionId!)
        .maybeSingle();

      const latestValue = new Map<string, number>();
      if (!transaction) return { transaction: null, latestValue };

      const tx = transaction as TransactionRow;

      // Latest history value per involved player (fallback for missing values).
      const involved = new Set<string>(Object.keys(playerMoves(tx.adds)));
      if (involved.size > 0) {
        const rows = await fetchAllRows<{ player_id: string; value: number; date: string }>((from, to) =>
          supabase
            .from('player_value_history')
            .select('player_id, value, date')
            .in('player_id', [...involved])
            .order('date', { ascending: false })
            .range(from, to)
        );
        for (const r of rows) if (!latestValue.has(r.player_id)) latestValue.set(r.player_id, r.value);
      }

      return { transaction: tx, latestValue };
    },
  });
}

/** All trades involving a roster, across every season. */
export function useTeamTrades(rosterId: number | undefined) {
  return useQuery({
    queryKey: ['team-trades', rosterId],
    enabled: rosterId !== undefined,
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('type', 'trade')
        .eq('status', 'complete')
        .contains('roster_ids', [rosterId!])
        .order('created', { ascending: true });
      return (data || []) as TransactionRow[];
    },
  });
}
