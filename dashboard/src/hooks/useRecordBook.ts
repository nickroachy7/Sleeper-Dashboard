import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from './queries';
import { pairGames, type MatchupRow, type Game } from './league';

// ── Record book data (parameterized by league) ────────────────────
// The all-time record book, season roll-call, and manager leaderboard for ONE
// league's dynasty chain — resolved from a caller-supplied root id, NOT the
// global active league. That's what lets the Ranking page's Records tab offer
// its own league filter without touching app-wide state. Each chain is walked
// and resolved on its own (team names, roster ids, and season links carry no
// cross-league qualifier), so nothing bleeds between leagues.

const num = (v: number | string | null | undefined): number => (v == null ? 0 : Number(v) || 0);

interface LeagueRow { league_id: string; season: string; name: string; previous_league_id: string | null; }
interface RosterRow { league_id: string; roster_id: number; owner_id: string | null; wins: number | null; losses: number | null; ties: number | null; fpts: number | string | null; }
interface LeagueUserRow { league_id: string; user_id: string; team_name: string | null; display_name: string | null; avatar: string | null; }
interface UserRow { user_id: string; display_name: string | null; username: string | null; avatar: string | null; }

export interface RecordItem { label: string; value: string; who: string; rosterId: number; leagueId: string; when: string; }
export interface SeasonRollRow { season: string; pointsRosterId: number; pointsName: string; pointsPf: number; }
export interface ManagerRow { ownerId: string; rosterId: number; name: string; avatar: string | null; wins: number; losses: number; ties: number; pf: number; seasons: number; titles: number; }

export interface RecordBook {
  records: RecordItem[];
  seasonRoll: SeasonRollRow[];
  managers: ManagerRow[];
  hasData: boolean;
}

/** Sort a season's rosters into standings order: wins, then points-for. */
function standingsOrder(rosters: RosterRow[]): RosterRow[] {
  return [...rosters].sort((a, b) => num(b.wins) - num(a.wins) || num(b.fpts) - num(a.fpts));
}

export function useRecordBook(rootLeagueId: string | null) {
  return useQuery<RecordBook>({
    queryKey: ['record-book', rootLeagueId ?? 'none'],
    enabled: !!rootLeagueId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RecordBook> => {
      const empty: RecordBook = { records: [], seasonRoll: [], managers: [], hasData: false };

      // Walk this root's previous_league_id chain (all leagues read unfiltered,
      // as elsewhere — the leagues table is the source of truth for links).
      const { data: allLeagues } = await supabase
        .from('leagues')
        .select('league_id, season, name, previous_league_id')
        .order('season', { ascending: false });
      const byId = new Map((allLeagues ?? []).map((l) => [l.league_id, l as LeagueRow]));
      const chain: string[] = [];
      const seen = new Set<string>();
      let cursor: string | null = byId.has(rootLeagueId!) ? rootLeagueId! : null;
      while (cursor && byId.has(cursor) && !seen.has(cursor)) {
        seen.add(cursor);
        chain.push(cursor);
        cursor = byId.get(cursor)?.previous_league_id ?? null;
      }
      if (!chain.length) return empty;

      const [rostersRaw, matchupsRaw, { data: leagueUsers }, { data: users }] = await Promise.all([
        supabase.from('rosters').select('league_id, roster_id, owner_id, wins, losses, ties, fpts').in('league_id', chain)
          .then((res) => (res.data ?? []) as RosterRow[]),
        fetchAllRows<MatchupRow>((from, to) =>
          supabase.from('matchups').select('league_id, week, matchup_id, roster_id, points').in('league_id', chain).range(from, to)
        ),
        supabase.from('league_users').select('league_id, user_id, team_name, display_name, avatar').in('league_id', chain),
        supabase.from('users').select('user_id, display_name, username, avatar'),
      ]);

      const currentLeagueId = chain[0];
      const luList = (leagueUsers ?? []) as LeagueUserRow[];
      const userList = (users ?? []) as UserRow[];

      const ownerOf = (rosterId: number, leagueId: string): string | null =>
        rostersRaw.find((r) => r.roster_id === rosterId && r.league_id === leagueId)?.owner_id ?? null;

      const teamName = (rosterId: number, leagueId: string): string => {
        const ownerId = ownerOf(rosterId, leagueId);
        if (!ownerId) return `Team ${rosterId}`;
        const lu = luList.find((u) => u.user_id === ownerId && u.league_id === leagueId)
          || luList.find((u) => u.user_id === ownerId);
        const user = userList.find((u) => u.user_id === ownerId);
        return lu?.team_name || lu?.display_name || user?.display_name || user?.username || `Team ${rosterId}`;
      };

      const teamAvatar = (rosterId: number, leagueId: string): string | null => {
        const ownerId = ownerOf(rosterId, leagueId);
        if (!ownerId) return null;
        const lu = luList.find((u) => u.user_id === ownerId && u.league_id === leagueId)
          || luList.find((u) => u.user_id === ownerId);
        const raw = lu?.avatar || userList.find((u) => u.user_id === ownerId)?.avatar;
        if (!raw) return null;
        return raw.startsWith('http') ? raw : `https://sleepercdn.com/avatars/thumbs/${raw}`;
      };

      // Seasons in the chain, flagged by whether they were actually played.
      const seasons = chain.map((lid) => {
        const rs = rostersRaw.filter((r) => r.league_id === lid);
        const started = rs.some((r) => num(r.wins) + num(r.losses) + num(r.ties) > 0);
        return { leagueId: lid, season: byId.get(lid)?.season ?? '', started };
      });
      const matchupsByLeague = new Map<string, MatchupRow[]>();
      for (const m of matchupsRaw) {
        const arr = matchupsByLeague.get(m.league_id) || [];
        arr.push(m);
        matchupsByLeague.set(m.league_id, arr);
      }

      // ── Record book (all played seasons) ──
      const allGames: Game[] = [];
      for (const s of seasons) {
        if (!s.started) continue;
        allGames.push(...pairGames(matchupsByLeague.get(s.leagueId) ?? [], s.season));
      }

      const records: RecordItem[] = [];
      if (allGames.length) {
        interface TeamGame { rosterId: number; leagueId: string; season: string; week: number; pts: number; oppPts: number; won: boolean; }
        const teamGames: TeamGame[] = [];
        for (const g of allGames) {
          teamGames.push({ rosterId: g.a.rosterId, leagueId: g.leagueId, season: g.season, week: g.week, pts: g.a.points, oppPts: g.b.points, won: g.a.points > g.b.points });
          teamGames.push({ rosterId: g.b.rosterId, leagueId: g.leagueId, season: g.season, week: g.week, pts: g.b.points, oppPts: g.a.points, won: g.b.points > g.a.points });
        }
        const scored = teamGames.filter((t) => t.pts > 0);
        const name = (r: TeamGame) => teamName(r.rosterId, r.leagueId);
        const maxBy = <T,>(arr: T[], f: (t: T) => number): T | null =>
          arr.reduce<T | null>((best, cur) => (best == null || f(cur) > f(best) ? cur : best), null);
        const minBy = <T,>(arr: T[], f: (t: T) => number): T | null =>
          arr.reduce<T | null>((best, cur) => (best == null || f(cur) < f(best) ? cur : best), null);

        const highGame = maxBy(scored, (t) => t.pts);
        const lowGame = minBy(scored, (t) => t.pts);
        const blowout = maxBy(allGames, (g) => Math.abs(g.a.points - g.b.points));
        const narrowest = minBy(allGames.filter((g) => g.a.points !== g.b.points), (g) => Math.abs(g.a.points - g.b.points));
        const highLoss = maxBy(scored.filter((t) => !t.won && t.pts !== t.oppPts), (t) => t.pts);
        const lowWin = minBy(scored.filter((t) => t.won), (t) => t.pts);
        const highCombined = maxBy(allGames, (g) => g.a.points + g.b.points);
        const winnerSide = (g: Game) => (g.a.points >= g.b.points ? g.a : g.b);
        const loserSide = (g: Game) => (g.a.points >= g.b.points ? g.b : g.a);

        const recs: (RecordItem | null)[] = [
          highGame && { label: 'Highest single game', value: `${highGame.pts.toFixed(1)} pts`, who: name(highGame), rosterId: highGame.rosterId, leagueId: highGame.leagueId, when: `${highGame.season} · Wk ${highGame.week}` },
          lowGame && { label: 'Lowest single game', value: `${lowGame.pts.toFixed(1)} pts`, who: name(lowGame), rosterId: lowGame.rosterId, leagueId: lowGame.leagueId, when: `${lowGame.season} · Wk ${lowGame.week}` },
          blowout && { label: 'Biggest blowout', value: `${Math.abs(blowout.a.points - blowout.b.points).toFixed(1)} margin`, who: teamName(winnerSide(blowout).rosterId, blowout.leagueId), rosterId: winnerSide(blowout).rosterId, leagueId: blowout.leagueId, when: `over ${teamName(loserSide(blowout).rosterId, blowout.leagueId)} · ${blowout.season} Wk ${blowout.week}` },
          narrowest && { label: 'Narrowest win', value: `${Math.abs(narrowest.a.points - narrowest.b.points).toFixed(2)} margin`, who: teamName(winnerSide(narrowest).rosterId, narrowest.leagueId), rosterId: winnerSide(narrowest).rosterId, leagueId: narrowest.leagueId, when: `over ${teamName(loserSide(narrowest).rosterId, narrowest.leagueId)} · ${narrowest.season} Wk ${narrowest.week}` },
          highLoss && { label: 'Most points in a loss', value: `${highLoss.pts.toFixed(1)} pts`, who: name(highLoss), rosterId: highLoss.rosterId, leagueId: highLoss.leagueId, when: `${highLoss.season} · Wk ${highLoss.week}` },
          lowWin && { label: 'Fewest points in a win', value: `${lowWin.pts.toFixed(1)} pts`, who: name(lowWin), rosterId: lowWin.rosterId, leagueId: lowWin.leagueId, when: `${lowWin.season} · Wk ${lowWin.week}` },
          highCombined && { label: 'Highest combined total', value: `${(highCombined.a.points + highCombined.b.points).toFixed(1)} pts`, who: `${teamName(highCombined.a.rosterId, highCombined.leagueId)} vs ${teamName(highCombined.b.rosterId, highCombined.leagueId)}`, rosterId: highCombined.a.rosterId, leagueId: highCombined.leagueId, when: `${highCombined.season} · Wk ${highCombined.week}` },
        ];
        records.push(...recs.filter((r): r is RecordItem => r != null));
      }

      // ── Season roll-call + all-time managers ──
      const played = seasons.filter((s) => s.started);
      const seasonRoll: SeasonRollRow[] = [];
      const byOwner = new Map<string, ManagerRow>();
      for (const s of played) {
        const rosters = rostersRaw.filter((r) => r.league_id === s.leagueId);
        if (!rosters.length) continue;
        const ordered = standingsOrder(rosters);
        const champ = ordered[0];
        const pointsLeader = [...rosters].sort((a, b) => num(b.fpts) - num(a.fpts))[0];
        seasonRoll.push({
          season: s.season,
          pointsRosterId: pointsLeader.roster_id,
          pointsName: teamName(pointsLeader.roster_id, s.leagueId),
          pointsPf: num(pointsLeader.fpts),
        });
        for (const r of rosters) {
          const oid = r.owner_id || `roster-${s.leagueId}-${r.roster_id}`;
          const m = byOwner.get(oid) || {
            ownerId: oid, rosterId: r.roster_id,
            name: teamName(r.roster_id, currentLeagueId), avatar: teamAvatar(r.roster_id, currentLeagueId),
            wins: 0, losses: 0, ties: 0, pf: 0, seasons: 0, titles: 0,
          };
          m.wins += num(r.wins);
          m.losses += num(r.losses);
          m.ties += num(r.ties);
          m.pf += num(r.fpts);
          m.seasons += 1;
          if (r.roster_id === champ.roster_id) m.titles += 1;
          if (r.owner_id) m.name = teamName(r.roster_id, currentLeagueId); // prefer current identity
          byOwner.set(oid, m);
        }
      }
      const managers = [...byOwner.values()].sort((a, b) => {
        const wpA = a.wins + a.losses + a.ties ? a.wins / (a.wins + a.losses + a.ties) : 0;
        const wpB = b.wins + b.losses + b.ties ? b.wins / (b.wins + b.losses + b.ties) : 0;
        return wpB - wpA || b.wins - a.wins;
      });

      return { records, seasonRoll, managers, hasData: records.length > 0 || managers.length > 0 };
    },
  });
}
