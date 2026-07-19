import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useActiveLeague } from '../lib/active-league';
import { resolveAllPicks } from './detail';
import { txDraftPicks, type TxDraftPick } from '../lib/trade-shared';
import type { PickResolution, TransactionRow } from '../types/domain';

// ── Cross-league feed data ────────────────────────────────────────
// The feed is league-NEUTRAL now: it streams activity from ALL of the user's
// added leagues, not just the active one. That means resolving several dynasty
// chains at once — and doing it per-chain, because team names, roster ids, and
// pick-resolution keys (`season-round-roster_id`) carry no league qualifier, so
// a union would let one league's roster 3 masquerade as another's. This hook
// fetches everything the feed needs across leagues and hands back resolvers
// that always take an explicit leagueId, keeping each item true to its league.

// Per-league recent-transaction cap; the component sorts + trims the merged
// stream. Kept modest so a user in many leagues doesn't pull the world.
const PER_LEAGUE_LIMIT = 40;

interface ChainInfo {
  root: string;
  name: string;
  leagueIds: string[]; // dynasty chain, newest season first
}

interface RosterRow { league_id: string; roster_id: number; owner_id: string | null; }
interface LeagueUserRow { league_id: string; user_id: string; team_name: string | null; display_name: string | null; avatar: string | null; }
interface UserRow { user_id: string; display_name: string | null; username: string | null; avatar: string | null; }

export interface MultiLeagueFeedData {
  transactions: TransactionRow[]; // every item carries its own league_id
  leagueName: (leagueId: string) => string;
  teamName: (rosterId: number, leagueId: string) => string;
  teamAvatar: (rosterId: number, leagueId: string) => string | null;
  resolvePick: (pick: TxDraftPick, leagueId: string) => PickResolution | undefined;
}

export function useMultiLeagueFeed() {
  const { leagues, activeLeagueId } = useActiveLeague();
  // Every added league, plus the active id when it's a preview the user hasn't
  // added (a shared ?league= link) — so a preview visitor still gets a feed.
  const roots = [...new Set([
    ...leagues.map((l) => l.rootLeagueId),
    ...(activeLeagueId ? [activeLeagueId] : []),
  ])];
  const key = [...roots].sort().join(',');

  return useQuery<MultiLeagueFeedData>({
    queryKey: ['multi-league-feed', key || 'none'],
    enabled: roots.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      // 1. Walk each tracked root's previous_league_id chain. Same unfiltered
      //    read useLeagueIds uses — the leagues table is the source of truth
      //    for the season links.
      const { data: allLeagues } = await supabase
        .from('leagues')
        .select('league_id, season, name, previous_league_id')
        .order('season', { ascending: false });
      const byId = new Map((allLeagues ?? []).map((l) => [l.league_id, l]));

      const chains: ChainInfo[] = roots.map((root) => {
        const ids: string[] = [];
        const seen = new Set<string>();
        let cursor: string | null = byId.has(root) ? root : null;
        while (cursor && byId.has(cursor) && !seen.has(cursor)) {
          seen.add(cursor);
          ids.push(cursor);
          cursor = byId.get(cursor)?.previous_league_id ?? null;
        }
        return { root, name: byId.get(root)?.name ?? 'League', leagueIds: ids.length ? ids : [root] };
      });

      const chainByLeagueId = new Map<string, number>();
      chains.forEach((c, i) => c.leagueIds.forEach((lid) => chainByLeagueId.set(lid, i)));
      const allLeagueIds = [...chainByLeagueId.keys()];
      if (!allLeagueIds.length) {
        return {
          transactions: [], leagueName: () => 'League',
          teamName: (rid) => `Team ${rid}`, teamAvatar: () => null, resolvePick: () => undefined,
        };
      }

      // 2. Recent transactions — the newest PER_LEAGUE_LIMIT PER CHAIN, fetched
      //    independently so a hyperactive dynasty can't crowd a quiet one out of
      //    the feed. A user follows only a handful of leagues, so N parallel
      //    reads is cheap. Directory rows (name/avatar) come alongside.
      const [txPerChain, { data: rosters }, { data: leagueUsers }, { data: users }] = await Promise.all([
        Promise.all(chains.map((c) =>
          supabase.from('transactions').select('*').in('league_id', c.leagueIds)
            .order('created', { ascending: false, nullsFirst: false })
            .limit(PER_LEAGUE_LIMIT)
            .then((res) => (res.data ?? []) as TransactionRow[])
        )),
        supabase.from('rosters').select('league_id, roster_id, owner_id').in('league_id', allLeagueIds),
        supabase.from('league_users').select('league_id, user_id, team_name, display_name, avatar').in('league_id', allLeagueIds),
        supabase.from('users').select('user_id, display_name, username, avatar'),
      ]);
      const transactions: TransactionRow[] = txPerChain.flat();

      // 3. Resolve picks per chain — separately, so keys never collide. Only
      //    resolve the picks that actually appear in the fetched transactions.
      const picksByChain = new Map<number, { season: string; round: number; roster_id: number }[]>();
      for (const tx of transactions) {
        const ci = chainByLeagueId.get(tx.league_id);
        if (ci == null) continue;
        const arr = picksByChain.get(ci) ?? [];
        for (const p of txDraftPicks(tx.draft_picks)) {
          arr.push({ season: String(p.season), round: Number(p.round), roster_id: Number(p.roster_id) });
        }
        picksByChain.set(ci, arr);
      }
      const resolutionByChain = new Map<number, Map<string, PickResolution>>();
      await Promise.all(
        [...picksByChain.entries()].map(async ([ci, picks]) => {
          if (!picks.length) return;
          resolutionByChain.set(ci, await resolveAllPicks(chains[ci].leagueIds, picks));
        })
      );

      // ── Resolvers (all leagueId-scoped) ──
      const rosterList = (rosters ?? []) as RosterRow[];
      const luList = (leagueUsers ?? []) as LeagueUserRow[];
      const userList = (users ?? []) as UserRow[];

      const ownerOf = (rosterId: number, leagueId: string): string | null =>
        rosterList.find((r) => r.roster_id === rosterId && r.league_id === leagueId)?.owner_id ?? null;

      const leagueName = (leagueId: string): string => byId.get(leagueId)?.name ?? 'League';

      const teamName = (rosterId: number, leagueId: string): string => {
        const ownerId = ownerOf(rosterId, leagueId);
        if (!ownerId) return `Team ${rosterId}`;
        const lu = luList.find((u) => u.user_id === ownerId && u.league_id === leagueId);
        const user = userList.find((u) => u.user_id === ownerId);
        return lu?.team_name || lu?.display_name || user?.display_name || user?.username || `Team ${rosterId}`;
      };

      const teamAvatar = (rosterId: number, leagueId: string): string | null => {
        const ownerId = ownerOf(rosterId, leagueId);
        if (!ownerId) return null;
        const lu = luList.find((u) => u.user_id === ownerId && u.league_id === leagueId);
        const raw = lu?.avatar || userList.find((u) => u.user_id === ownerId)?.avatar;
        if (!raw) return null;
        return raw.startsWith('http') ? raw : `https://sleepercdn.com/avatars/thumbs/${raw}`;
      };

      const resolvePick = (pick: TxDraftPick, leagueId: string): PickResolution | undefined => {
        const ci = chainByLeagueId.get(leagueId);
        if (ci == null) return undefined;
        return resolutionByChain.get(ci)?.get(`${pick.season}-${pick.round}-${pick.roster_id}`);
      };

      return { transactions, leagueName, teamName, teamAvatar, resolvePick };
    },
  });
}
