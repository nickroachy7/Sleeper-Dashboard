import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { playerMoves, txDraftPicks } from '../lib/trade-shared';
import { VALUE_SOURCE } from '../lib/value-source';
import { useLeagueIds } from './queries';
import type { TransactionRow, PickResolution } from '../types/domain';

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

// Scoped to the active dynasty's season chain — an empty chain matches nothing,
// so a fresh visitor (or a second dynasty in the DB) never leaks in.
function fetchAllTransactions(chain: string[]): Promise<TransactionRow[]> {
  return fetchAllRows<TransactionRow>((from, to) =>
    supabase.from('transactions').select('*').in('league_id', chain).order('created', { ascending: false }).range(from, to)
  );
}

/** League directory: every season, roster, and team name in one cached blob. */
export function useLeagueDirectory() {
  // Scope to the active dynasty's season chain so switching leagues shows the
  // right rosters/team names (and multiple dynasties in the DB don't bleed
  // together). An empty chain (no active league) filters to nothing rather
  // than leaking another league's data to a fresh visitor.
  const { data: ids } = useLeagueIds();
  const activeCurrentId = ids?.current ?? null;
  const chain = ids?.chain ?? [];
  return useQuery({
    queryKey: ['league-directory', activeCurrentId, chain.join(',') || 'none'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [{ data: leagues }, { data: rosters }, { data: users }, { data: leagueUsers }] =
        await Promise.all([
          supabase.from('leagues').select('league_id, season, name').in('league_id', chain).order('season', { ascending: false }),
          supabase.from('rosters').select('league_id, roster_id, owner_id, players, wins, losses, ties, fpts, fpts_against').in('league_id', chain),
          supabase.from('users').select('user_id, display_name, username, avatar'),
          supabase.from('league_users').select('league_id, user_id, team_name, display_name, avatar').in('league_id', chain),
        ]);

      const seasonByLeague = new Map<string, string>();
      (leagues || []).forEach((l) => seasonByLeague.set(l.league_id, l.season));
      const currentLeagueId = activeCurrentId ?? null;

      // Sleeper stores a manager's CUSTOM team logo in metadata.avatar (a full
      // uploads URL), separate from their personal user avatar. We don't sync
      // that column, so fetch the current league's users live and map
      // owner_id → team-logo URL. Falls back to the user avatar when absent.
      const teamLogoByOwner = new Map<string, string>();
      if (currentLeagueId) {
        try {
          const res = await fetch(`https://api.sleeper.app/v1/league/${currentLeagueId}/users`);
          const sleeperUsers: { user_id?: string; metadata?: { avatar?: string } }[] = await res.json();
          if (Array.isArray(sleeperUsers)) {
            for (const u of sleeperUsers) {
              if (u.user_id && u.metadata?.avatar) teamLogoByOwner.set(u.user_id, u.metadata.avatar);
            }
          }
        } catch { /* fall back to user avatars below */ }
      }

      const ownerOf = (rosterId: number, leagueId?: string | null): string | null => {
        const lid = leagueId || currentLeagueId;
        const roster = (rosters || []).find((r) => r.roster_id === rosterId && r.league_id === lid)
          || (rosters || []).find((r) => r.roster_id === rosterId && r.league_id === currentLeagueId);
        return roster?.owner_id ?? null;
      };

      const teamName = (rosterId: number, leagueId?: string | null): string => {
        const ownerId = ownerOf(rosterId, leagueId);
        if (!ownerId) return `Team ${rosterId}`;
        const lu = (leagueUsers || []).find((u) => u.user_id === ownerId && u.league_id === currentLeagueId)
          || (leagueUsers || []).find((u) => u.user_id === ownerId);
        const user = (users || []).find((u) => u.user_id === ownerId);
        return lu?.team_name || lu?.display_name || user?.display_name || user?.username || `Team ${rosterId}`;
      };

      // Team logo (custom upload) for a roster, preferred over the user avatar.
      const teamAvatar = (rosterId: number, leagueId?: string | null): string | null => {
        const ownerId = ownerOf(rosterId, leagueId);
        if (!ownerId) return null;
        const logo = teamLogoByOwner.get(ownerId);
        if (logo) return logo.startsWith('http') ? logo : `https://sleepercdn.com/uploads/${logo}`;
        const lu = (leagueUsers || []).find((u) => u.user_id === ownerId && u.league_id === currentLeagueId)
          || (leagueUsers || []).find((u) => u.user_id === ownerId);
        const raw = (lu as { avatar?: string | null } | undefined)?.avatar
          || (users || []).find((u) => u.user_id === ownerId)?.avatar;
        if (!raw) return null;
        return raw.startsWith('http') ? raw : `https://sleepercdn.com/avatars/thumbs/${raw}`;
      };

      return {
        leagues: leagues || [],
        rosters: rosters || [],
        users: users || [],
        leagueUsers: leagueUsers || [],
        currentLeagueId,
        seasonByLeague,
        teamName,
        teamAvatar,
      };
    },
  });
}

/** All data for the player detail page. */
export function usePlayerDetail(playerId: string | undefined) {
  const { data: ids } = useLeagueIds();
  const chain = ids?.chain ?? [];
  return useQuery({
    queryKey: ['player-detail', playerId, chain.join(',') || 'none'],
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
        supabase.from('player_values').select('*').eq('player_id', pid).eq('source', VALUE_SOURCE).maybeSingle(),
        supabase.from('player_value_history').select('date, value').eq('player_id', pid).eq('source', VALUE_SOURCE).order('date', { ascending: true }),
        // !inner + league filter: only drafts from the active dynasty's chain,
        // not every tracked league the player was ever drafted in.
        supabase.from('draft_picks').select('*, drafts!inner(season, league_id, type)').eq('player_id', pid).in('drafts.league_id', chain),
        // Player's transactions + owning teams scoped to the active dynasty only.
        fetchAllTransactions(chain),
        supabase.from('rosters').select('league_id, roster_id, owner_id').contains('players', [pid]).in('league_id', chain),
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

export interface PlayerSeasonFact {
  season: number;
  age: number | null;
  years_exp: number | null;
  games: number | null;
  /** PPR fantasy points per game that season. */
  fantasy_ppg: number | null;
  /** PPR fantasy points, full season. */
  fantasy_total: number | null;
  draft_round: number | null;
  draft_pick: number | null;
}

/**
 * Season-by-season NFL production for one player (nflverse facts) — the
 * career-arc data the player page uses to show real on-field output, not just
 * market value. Sorted oldest → newest. Empty for players with no NFL seasons
 * on record (incoming rookies, most IDP, practice-squad names).
 */
export function usePlayerFacts(playerId: string | undefined) {
  return useQuery({
    queryKey: ['player-facts', playerId],
    enabled: !!playerId,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<PlayerSeasonFact[]> => {
      const { data } = await supabase
        .from('player_facts')
        .select('season, age, years_exp, games, fantasy_ppg, fantasy_total, draft_round, draft_pick')
        .eq('player_id', playerId!)
        .order('season', { ascending: true });
      return (data || []) as PlayerSeasonFact[];
    },
  });
}

export interface PlayerWeek {
  week: number;
  points: number;
  /** True if the owning team STARTED this player that week (vs benched). */
  started: boolean;
}

export interface PlayerLeagueSeason {
  season: string;
  leagueId: string;
  weeks: PlayerWeek[];
  games: number;         // weeks the player was rostered & scored a line
  avg: number;           // avg points across those weeks
  best: PlayerWeek | null;
  worst: PlayerWeek | null;
  startRate: number;     // 0..1 share of rostered weeks the team started him
  stdev: number;         // scoring consistency (lower = steadier)
}

/**
 * A player's weekly fantasy output INSIDE the active dynasty, per season, from
 * `matchups.players_points`. Each week the player appears in exactly one team's
 * players_points (whoever rostered him); `starters` tells us whether that team
 * actually started him. Seasons are newest-first. This is the "how did he score
 * in OUR league, and did the owner trust him" view — league-specific, so it
 * only renders once a league is added.
 */
export function usePlayerLeagueWeeks(playerId: string | undefined) {
  const { data: ids } = useLeagueIds();
  const chain = ids?.chain ?? [];
  return useQuery({
    queryKey: ['player-league-weeks', playerId, chain.join(',') || 'none'],
    enabled: !!playerId && chain.length > 0,
    queryFn: async (): Promise<PlayerLeagueSeason[]> => {
      const pid = playerId!;
      const [{ data: leagues }, rows] = await Promise.all([
        supabase.from('leagues').select('league_id, season').in('league_id', chain),
        fetchAllRows<{ league_id: string; week: number; starters: string[] | null; players_points: Record<string, number> | null }>((from, to) =>
          supabase
            .from('matchups')
            .select('league_id, week, starters, players_points')
            .in('league_id', chain)
            .range(from, to)
            .returns<{ league_id: string; week: number; starters: string[] | null; players_points: Record<string, number> | null }[]>()
        ),
      ]);
      const seasonOf = new Map<string, string>((leagues || []).map((l) => [l.league_id, l.season]));

      // Collect this player's weekly line, grouped by league (season).
      const byLeague = new Map<string, PlayerWeek[]>();
      for (const m of rows) {
        const pp = m.players_points;
        if (!pp || !(pid in pp)) continue;
        const arr = byLeague.get(m.league_id) || [];
        arr.push({ week: m.week, points: pp[pid] ?? 0, started: (m.starters || []).includes(pid) });
        byLeague.set(m.league_id, arr);
      }

      const seasons: PlayerLeagueSeason[] = [];
      for (const [leagueId, weeksRaw] of byLeague) {
        const weeks = weeksRaw.sort((a, b) => a.week - b.week);
        const pts = weeks.map((w) => w.points);
        const games = weeks.length;
        const avg = games ? pts.reduce((s, v) => s + v, 0) / games : 0;
        const variance = games ? pts.reduce((s, v) => s + (v - avg) ** 2, 0) / games : 0;
        const best = weeks.reduce<PlayerWeek | null>((b, w) => (b == null || w.points > b.points ? w : b), null);
        const worst = weeks.reduce<PlayerWeek | null>((b, w) => (b == null || w.points < b.points ? w : b), null);
        const started = weeks.filter((w) => w.started).length;
        seasons.push({
          season: seasonOf.get(leagueId) ?? leagueId,
          leagueId,
          weeks,
          games,
          avg,
          best,
          worst,
          startRate: games ? started / games : 0,
          stdev: Math.sqrt(variance),
        });
      }
      return seasons.sort((a, b) => b.season.localeCompare(a.season));
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
          .eq('source', VALUE_SOURCE)
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

export interface SeasonRankPoint {
  season: string;
  /** Rank (1 = best) of this roster's total KTC value among the league that season. */
  powerRank: number;
  /** Actual standings finish (1 = best), by wins then points. Null before games. */
  finishRank: number | null;
  /** The team's roster value that season (for the tooltip). */
  value: number;
  wins: number;
  losses: number;
  teams: number;
}

/**
 * Per-season POWER RANK (roster talent) and FINISH RANK (actual standings) for
 * one team — the legible "am I building or declining, and am I over/under-
 * achieving" story. Power rank comes from valuing each team's actual season
 * roster at that season's KTC and ranking them; finish rank from wins→points.
 * Ranks are league-relative, so they're immune to the leaguewide value inflation
 * that made raw-dollar charts meaningless.
 *
 * `ownerId` ties the team across seasons (roster_id can differ).
 */
export function useSeasonRanks(ownerId: string | null | undefined) {
  const { data: ids } = useLeagueIds();
  const chain = ids?.chain ?? [];
  return useQuery({
    queryKey: ['season-ranks', ownerId, chain.join(',') || 'none'],
    enabled: !!ownerId,
    queryFn: async (): Promise<SeasonRankPoint[]> => {
      // Scope to the active dynasty's seasons so a manager who also plays in
      // another league doesn't get both dynasties' ranks mixed together.
      const { data: leagues } = await supabase
        .from('leagues').select('league_id, season').in('league_id', chain).order('season', { ascending: true });
      if (!leagues?.length) return [];

      const { data: rosters } = await supabase
        .from('rosters').select('league_id, roster_id, owner_id, players, wins, losses, fpts').in('league_id', chain);

      const points: SeasonRankPoint[] = [];
      for (const lg of leagues) {
        const leagueRosters = (rosters || []).filter((r) => r.league_id === lg.league_id);
        if (!leagueRosters.length) continue;

        // Value date: a point inside the season (Dec 15), or today if that's future.
        const todayIso = new Date().toISOString().slice(0, 10);
        let asOf = `${lg.season}-12-15`;
        if (asOf > todayIso) asOf = todayIso;

        const allPlayerIds = [...new Set(leagueRosters.flatMap((r) => (r.players as string[]) || []))];
        if (!allPlayerIds.length) continue;

        // Latest value at-or-before asOf per player, from a narrow window.
        const windowLo = new Date(asOf);
        windowLo.setDate(windowLo.getDate() - 14);
        const loIso = windowLo.toISOString().slice(0, 10);
        const rows = await fetchAllRows<{ player_id: string; value: number; date: string }>((from, to) =>
          supabase
            .from('player_value_history')
            .select('player_id, value, date')
            .in('player_id', allPlayerIds)
            .eq('source', VALUE_SOURCE)
            .lte('date', asOf)
            .gte('date', loIso)
            .order('date', { ascending: false })
            .range(from, to)
        );
        const valOf = new Map<string, number>();
        for (const r of rows) if (!valOf.has(r.player_id)) valOf.set(r.player_id, r.value);

        const withVal = leagueRosters.map((r) => ({
          roster: r,
          value: ((r.players as string[]) || []).reduce((s, pid) => s + (valOf.get(pid) || 0), 0),
        }));
        const mine = withVal.find((x) => x.roster.owner_id === ownerId);
        if (!mine) continue;

        // Skip seasons that haven't kicked off yet (offseason/future): a 0-0
        // season has no talent-vs-results story and shouldn't appear as a ranked
        // season. This is data-driven, so a season joins the chart the moment
        // its first games are synced.
        const anyGames = leagueRosters.some((r) => (r.wins || 0) + (r.losses || 0) > 0);
        if (!anyGames) continue;

        // Power rank: sort by value desc.
        const powerRank = [...withVal].sort((a, b) => b.value - a.value)
          .findIndex((x) => x.roster.owner_id === ownerId) + 1;

        // Finish rank: wins then points.
        const finishRank = [...leagueRosters].sort((a, b) =>
          (b.wins || 0) - (a.wins || 0) || Number(b.fpts || 0) - Number(a.fpts || 0)
        ).findIndex((r) => r.owner_id === ownerId) + 1;

        points.push({
          season: lg.season,
          powerRank,
          finishRank,
          value: mine.value,
          wins: mine.roster.wins || 0,
          losses: mine.roster.losses || 0,
          teams: leagueRosters.length,
        });
      }
      return points;
    },
  });
}

export interface TeamLineup {
  /** League lineup slots in order (includes BN/TAXI/IR). */
  slots: string[];
  /** Player ids the team is starting, parallel to the non-bench slots. "0" = empty. */
  starters: string[];
  /** Every player id on the roster. */
  players: string[];
}

/**
 * The current roster's starting lineup + slots, so the roster tab can group
 * players into the actual lineup (by slot) vs the bench, instead of a flat list.
 */
export function useTeamLineup(rosterId: number | undefined) {
  const { data: ids } = useLeagueIds();
  const current = ids?.current ?? null;
  return useQuery({
    queryKey: ['team-lineup', current, rosterId],
    enabled: rosterId !== undefined && !!current,
    queryFn: async (): Promise<TeamLineup> => {
      const [{ data: league }, { data: roster }] = await Promise.all([
        supabase.from('leagues').select('roster_positions').eq('league_id', current!).maybeSingle(),
        supabase.from('rosters').select('starters, players').eq('league_id', current!).eq('roster_id', rosterId!).maybeSingle(),
      ]);
      return {
        slots: (league?.roster_positions as string[] | null) ?? [],
        starters: (roster?.starters as string[] | null) ?? [],
        players: (roster?.players as string[] | null) ?? [],
      };
    },
  });
}

export interface HeadToHead {
  opponentOwnerId: string;
  wins: number;
  losses: number;
  ties: number;
  games: number;
  pointsFor: number;
  pointsAgainst: number;
}

/**
 * A manager's all-time head-to-head record vs every other manager in the
 * dynasty. Pairs the two rosters in each weekly matchup (`matchup_id`), decides
 * the game by points, and tallies by OPPONENT OWNER so rivalries hold together
 * across seasons even when roster_ids shuffle. Sorted by games played.
 */
export function useHeadToHead(ownerId: string | null | undefined) {
  const { data: ids } = useLeagueIds();
  const chain = ids?.chain ?? [];
  return useQuery({
    queryKey: ['head-to-head', ownerId, chain.join(',') || 'none'],
    enabled: !!ownerId && chain.length > 0,
    queryFn: async (): Promise<HeadToHead[]> => {
      const [{ data: rosters }, matchups] = await Promise.all([
        supabase.from('rosters').select('league_id, roster_id, owner_id').in('league_id', chain),
        fetchAllRows<{ league_id: string; week: number; matchup_id: number | null; roster_id: number; points: number | null }>((from, to) =>
          supabase.from('matchups').select('league_id, week, matchup_id, roster_id, points').in('league_id', chain).range(from, to)),
      ]);
      // (league_id, roster_id) → owner_id, for cross-season identity.
      const ownerOf = new Map<string, string>();
      (rosters || []).forEach((r) => { if (r.owner_id) ownerOf.set(`${r.league_id}-${r.roster_id}`, r.owner_id); });

      const tally = new Map<string, HeadToHead>();
      // Group matchup rows by league+week+matchup_id to find the two sides.
      const groups = new Map<string, typeof matchups>();
      for (const m of matchups) {
        if (m.matchup_id == null || m.points == null) continue;
        const key = `${m.league_id}-${m.week}-${m.matchup_id}`;
        const arr = groups.get(key) || [];
        arr.push(m);
        groups.set(key, arr);
      }
      for (const [, pair] of groups) {
        if (pair.length !== 2) continue; // ignore byes / medians / malformed
        const [a, b] = pair;
        const aOwner = ownerOf.get(`${a.league_id}-${a.roster_id}`);
        const bOwner = ownerOf.get(`${b.league_id}-${b.roster_id}`);
        if (!aOwner || !bOwner || aOwner === bOwner) continue;
        // Only tally games involving the target manager.
        let me: typeof a, opp: typeof b, oppOwner: string;
        if (aOwner === ownerId) { me = a; opp = b; oppOwner = bOwner; }
        else if (bOwner === ownerId) { me = b; opp = a; oppOwner = aOwner; }
        else continue;

        const rec = tally.get(oppOwner) || { opponentOwnerId: oppOwner, wins: 0, losses: 0, ties: 0, games: 0, pointsFor: 0, pointsAgainst: 0 };
        rec.games++;
        rec.pointsFor += me.points ?? 0;
        rec.pointsAgainst += opp.points ?? 0;
        if ((me.points ?? 0) > (opp.points ?? 0)) rec.wins++;
        else if ((me.points ?? 0) < (opp.points ?? 0)) rec.losses++;
        else rec.ties++;
        tally.set(oppOwner, rec);
      }
      return [...tally.values()].sort((x, y) => y.games - x.games || y.wins - x.wins);
    },
  });
}

// ── Optimal-lineup efficiency ("coach rating") ─────────────────────────

// Which player positions each lineup slot can hold. Nested eligibility (QB ⊂
// SUPER_FLEX, RB/WR/TE ⊂ FLEX ⊂ SUPER_FLEX) makes greedy most-restrictive-first
// assignment optimal.
const SLOT_ELIGIBILITY: Record<string, string[]> = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], K: ['K'], DEF: ['DEF'],
  FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  DL: ['DL', 'DE', 'DT'], LB: ['LB'], DB: ['DB', 'CB', 'S'],
  IDP_FLEX: ['DL', 'DE', 'DT', 'LB', 'DB', 'CB', 'S'],
};
const NON_STARTING = new Set(['BN', 'TAXI', 'IR']);

/**
 * Best-possible starting points from a set of scored players, given the league's
 * lineup slots. Fills the most restrictive slots first, each time taking the
 * highest-scoring still-unused eligible player — optimal because Sleeper's slot
 * eligibilities are nested.
 */
export function optimalLineupPoints(
  slots: string[],
  playerPoints: Record<string, number>,
  positionOf: (pid: string) => string | null | undefined,
): number {
  const pool = Object.entries(playerPoints).map(([pid, pts]) => ({
    pid, pts: pts ?? 0, pos: positionOf(pid) || '',
  }));
  const starting = slots
    .filter((s) => !NON_STARTING.has(s))
    .map((s) => ({ slot: s, elig: SLOT_ELIGIBILITY[s] ?? [s] }))
    .sort((a, b) => a.elig.length - b.elig.length); // most restrictive first

  const used = new Set<string>();
  let total = 0;
  for (const { elig } of starting) {
    let best: { pid: string; pts: number } | null = null;
    for (const p of pool) {
      if (used.has(p.pid) || !elig.includes(p.pos)) continue;
      if (!best || p.pts > best.pts) best = p;
    }
    if (best) { used.add(best.pid); total += best.pts; }
  }
  return total;
}

export interface LineupWeek {
  week: number;
  actual: number;   // points the team's actual starters scored
  optimal: number;  // best-possible from the same roster that week
}

export interface LineupEfficiency {
  season: string;
  weeks: LineupWeek[];
  actual: number;
  optimal: number;
  pointsLeft: number;        // optimal − actual, summed
  efficiency: number;        // 0..1 = actual / optimal
  rank: number;              // coach rank in league (1 = best lineup setter)
  teams: number;
  leagueAvgEfficiency: number;
}

/**
 * "Coach rating": how well a manager sets their lineup. For the most recent
 * PLAYED season, compares each week's actual starter output to the best lineup
 * they could have fielded from their roster (`players_points` + the league's
 * slots), then ranks every team by season efficiency. Surfaces the points a
 * manager left on their bench — a metric Sleeper itself never shows.
 */
export function useLineupEfficiency(ownerId: string | null | undefined) {
  const { data: ids } = useLeagueIds();
  const chain = ids?.chain ?? [];
  return useQuery({
    queryKey: ['lineup-efficiency', ownerId, chain.join(',') || 'none'],
    enabled: !!ownerId && chain.length > 0,
    queryFn: async (): Promise<LineupEfficiency | null> => {
      const { data: leagues } = await supabase
        .from('leagues').select('league_id, season, roster_positions').in('league_id', chain).order('season', { ascending: false });
      if (!leagues?.length) return null;

      // Lightweight scan to find the newest season that actually has scoring.
      const light = await fetchAllRows<{ league_id: string; points: number | null }>((from, to) =>
        supabase.from('matchups').select('league_id, points').in('league_id', chain).range(from, to));
      const played = new Set(light.filter((m) => (m.points ?? 0) > 0).map((m) => m.league_id));
      const target = leagues.find((l) => played.has(l.league_id));
      if (!target) return null;

      const [{ data: rosters }, heavy, players] = await Promise.all([
        supabase.from('rosters').select('roster_id, owner_id').eq('league_id', target.league_id),
        fetchAllRows<{ week: number; roster_id: number; starters_points: number[] | null; players_points: Record<string, number> | null }>((from, to) =>
          supabase.from('matchups').select('week, roster_id, starters_points, players_points').eq('league_id', target.league_id).range(from, to)
            .returns<{ week: number; roster_id: number; starters_points: number[] | null; players_points: Record<string, number> | null }[]>()),
        fetchAllRows<{ player_id: string; position: string | null }>((from, to) =>
          supabase.from('players').select('player_id, position').range(from, to)),
      ]);
      const myRosterId = (rosters || []).find((r) => r.owner_id === ownerId)?.roster_id;
      if (myRosterId === undefined) return null;
      const posOf = new Map(players.map((p) => [p.player_id, p.position]));
      const slots = target.roster_positions || [];
      const posLookup = (pid: string) => posOf.get(pid);

      // Per roster: sum actual + optimal across the season.
      const byRoster = new Map<number, { actual: number; optimal: number; weeks: LineupWeek[] }>();
      for (const m of heavy) {
        if (!m.players_points) continue;
        const actual = (m.starters_points || []).reduce((s, v) => s + (v ?? 0), 0);
        const optimal = optimalLineupPoints(slots, m.players_points, posLookup);
        const agg = byRoster.get(m.roster_id) || { actual: 0, optimal: 0, weeks: [] };
        agg.actual += actual;
        agg.optimal += optimal;
        agg.weeks.push({ week: m.week, actual, optimal });
        byRoster.set(m.roster_id, agg);
      }

      const effOf = (a: { actual: number; optimal: number }) => (a.optimal > 0 ? a.actual / a.optimal : 1);
      const ranked = [...byRoster.entries()]
        .map(([rid, a]) => ({ rid, eff: effOf(a) }))
        .sort((x, y) => y.eff - x.eff);
      const rank = ranked.findIndex((r) => r.rid === myRosterId) + 1;
      const leagueAvgEfficiency = ranked.length ? ranked.reduce((s, r) => s + r.eff, 0) / ranked.length : 1;

      const mine = byRoster.get(myRosterId);
      if (!mine) return null;
      return {
        season: target.season,
        weeks: mine.weeks.sort((a, b) => a.week - b.week),
        actual: mine.actual,
        optimal: mine.optimal,
        pointsLeft: mine.optimal - mine.actual,
        efficiency: effOf(mine),
        rank,
        teams: ranked.length,
        leagueAvgEfficiency,
      };
    },
  });
}

// ── Team analytics (3 charts: contention window, scoring/luck, positional edge) ──

export interface TeamAnalytics {
  /** Roster value bucketed by player age → contention window shape. */
  ageBuckets: { age: number; value: number }[];
  /** Value-weighted average age of this roster + the league average of that. */
  weightedAge: number;
  leagueWeightedAge: number;
  /** Per-season scoring + luck: actual wins vs all-play (luck-neutral) wins. */
  scoring: {
    season: string;
    avg: number;         // avg weekly points
    stdev: number;       // scoring consistency (lower = steadier)
    wins: number; losses: number;              // head-to-head record
    allPlayWinPct: number;                     // 0..1, luck-neutral
    games: number;
  }[];
}

/**
 * Everything the team-analytics tab needs, in one bundle:
 *  1. Contention window — current roster value by player age.
 *  2. Scoring & luck — per season, actual record vs all-play win% (a big gap
 *     means wins/losses were driven by schedule luck, not scoring).
 *  3. Positional edge — current roster value per position vs the league.
 */
export function useTeamAnalytics(rosterId: number | undefined, ownerId: string | null | undefined) {
  const { data: ids } = useLeagueIds();
  const chain = ids?.chain ?? [];
  return useQuery({
    queryKey: ['team-analytics', rosterId, ownerId, chain.join(',') || 'none'],
    enabled: rosterId !== undefined && !!ownerId,
    queryFn: async (): Promise<TeamAnalytics> => {
      // League-scoped tables (leagues/rosters/matchups) filtered to the active
      // dynasty; players/player_values are global (league-agnostic).
      const [{ data: leagues }, { data: rosters }, players, pvRows, matchups] = await Promise.all([
        supabase.from('leagues').select('league_id, season').in('league_id', chain).order('season', { ascending: true }),
        supabase.from('rosters').select('league_id, roster_id, owner_id, players').in('league_id', chain),
        fetchAllRows<{ player_id: string; position: string | null; age: number | null }>((from, to) =>
          supabase.from('players').select('player_id, position, age').range(from, to)),
        fetchAllRows<{ player_id: string; value: number }>((from, to) =>
          supabase.from('player_values').select('player_id, value').eq('source', VALUE_SOURCE).range(from, to)),
        fetchAllRows<{ league_id: string; week: number; roster_id: number; points: number | null; matchup_id: number | null }>((from, to) =>
          supabase.from('matchups').select('league_id, week, roster_id, points, matchup_id').in('league_id', chain).range(from, to)),
      ]);

      const currentLeagueId = leagues?.[leagues.length - 1]?.league_id ?? null;
      const playerById = new Map(players.map((p) => [p.player_id, p]));
      const valOf = new Map(pvRows.map((r) => [r.player_id, r.value]));
      const allRosters = rosters || [];
      const currentRosters = allRosters.filter((r) => r.league_id === currentLeagueId);
      const mine = currentRosters.find((r) => r.roster_id === rosterId);
      const myPlayers = (mine?.players as string[]) || [];

      // 1. Age buckets + weighted ages ------------------------------------
      const ageMap = new Map<number, number>();
      let wSum = 0, vSum = 0;
      for (const pid of myPlayers) {
        const p = playerById.get(pid); const v = valOf.get(pid) || 0;
        if (!p?.age || !v) continue;
        const a = Math.round(p.age);
        ageMap.set(a, (ageMap.get(a) || 0) + v);
        wSum += v * p.age; vSum += v;
      }
      const ageBuckets = [...ageMap.entries()].map(([age, value]) => ({ age, value })).sort((a, b) => a.age - b.age);
      const weightedAge = vSum ? wSum / vSum : 0;
      // League weighted-age average
      const teamWtAges: number[] = [];
      for (const r of currentRosters) {
        let ws = 0, vs = 0;
        for (const pid of (r.players as string[]) || []) {
          const p = playerById.get(pid); const v = valOf.get(pid) || 0;
          if (p?.age && v) { ws += v * p.age; vs += v; }
        }
        if (vs) teamWtAges.push(ws / vs);
      }
      const leagueWeightedAge = teamWtAges.length ? teamWtAges.reduce((s, a) => s + a, 0) / teamWtAges.length : 0;

      // 2. Scoring & luck per season --------------------------------------
      const scoring: TeamAnalytics['scoring'] = [];
      for (const lg of leagues || []) {
        const rows = matchups.filter((m) => m.league_id === lg.league_id);
        if (rows.length < 12) continue; // skip barely-started seasons
        // owner's roster_id in THIS season
        const seasonRoster = allRosters.find((r) => r.league_id === lg.league_id && r.owner_id === ownerId);
        if (!seasonRoster) continue;
        const rid = seasonRoster.roster_id;
        const byWeek = new Map<number, typeof rows>();
        for (const m of rows) { const arr = byWeek.get(m.week) || []; arr.push(m); byWeek.set(m.week, arr); }
        const scores: number[] = [];
        let wins = 0, losses = 0, apWin = 0, apGames = 0;
        for (const [, wk] of byWeek) {
          const me = wk.find((m) => m.roster_id === rid);
          if (!me || me.points == null) continue;
          const myPts = me.points;
          scores.push(myPts);
          // head-to-head via matchup_id
          const opp = wk.find((m) => m.matchup_id === me.matchup_id && m.roster_id !== rid);
          if (opp && opp.points != null) { if (myPts > opp.points) wins++; else losses++; }
          // all-play: vs everyone else that week
          for (const m of wk) {
            if (m.roster_id === rid || m.points == null) continue;
            apGames++; if (myPts > m.points) apWin++;
          }
        }
        if (!scores.length) continue;
        const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
        const variance = scores.reduce((s, v) => s + (v - avg) ** 2, 0) / scores.length;
        scoring.push({
          season: lg.season, avg, stdev: Math.sqrt(variance),
          wins, losses, allPlayWinPct: apGames ? apWin / apGames : 0, games: wins + losses,
        });
      }

      return { ageBuckets, weightedAge, leagueWeightedAge, scoring };
    },
  });
}

/**
 * Value history for MULTIPLE sides of a trade in one query, so the timeline
 * chart works for 2-, 3-, or 4-team trades (React hooks can't be called in a
 * variable-length loop, so a fixed pair of useRosterValueHistory calls can't
 * scale). Each side contributes a set of player ids; `baseline[i]` is a flat
 * value added to every point of side i — used to fold in future draft picks,
 * which have no per-day history of their own but still count toward the side's
 * total. Returns one HistoryPoint[] per side, index-aligned with `sides`.
 */
export function useMultiRosterValueHistory(
  sides: { playerIds: string[]; baseline?: number }[] | undefined
) {
  const key = (sides || [])
    .map((s) => `${[...s.playerIds].sort().join('.')}|${s.baseline ?? 0}`)
    .join(';');
  const allIds = [...new Set((sides || []).flatMap((s) => s.playerIds))];
  return useQuery({
    queryKey: ['multi-roster-value-history', key],
    enabled: !!allIds.length,
    queryFn: async () => {
      const rows = await fetchAllRows<{ player_id: string; date: string; value: number }>((from, to) =>
        supabase
          .from('player_value_history')
          .select('player_id, date, value')
          .in('player_id', allIds)
          .eq('source', VALUE_SOURCE)
          .order('date', { ascending: true })
          .range(from, to)
      );

      // value[player_id][date] for quick per-side summing.
      const byPlayer = new Map<string, Map<string, number>>();
      for (const r of rows) {
        let m = byPlayer.get(r.player_id);
        if (!m) { m = new Map(); byPlayer.set(r.player_id, m); }
        m.set(r.date, r.value);
      }

      return (sides || []).map((side) => {
        const baseline = side.baseline ?? 0;
        const byDate = new Map<string, number>();
        for (const pid of side.playerIds) {
          const m = byPlayer.get(pid);
          if (!m) continue;
          for (const [date, value] of m) byDate.set(date, (byDate.get(date) || 0) + value);
        }
        // Fold the flat pick baseline into every dated point.
        const points = [...byDate.entries()]
          .map(([date, value]) => ({ date, value: value + baseline }))
          .sort((a, b) => a.date.localeCompare(b.date)) as HistoryPoint[];
        return points;
      });
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
            .eq('source', VALUE_SOURCE)
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

// PickResolution now lives in types/domain.ts so pure helpers (trade-shared) can
// consume it without importing this hook module.
export type { PickResolution } from '../types/domain';

/**
 * Resolve EVERY traded draft pick in the league in one cached blob, keyed
 * `${season}-${round}-${originalRosterId}`. This is the single source of truth
 * for "what did this pick become" — the trade detail page and the transactions
 * list both read from it so a used pick shows the same drafted player + value on
 * every surface.
 *
 * Past picks resolve to the drafted player via Sleeper's authoritative
 * draft_order / slot_to_roster_id → board mapping; future picks get a projected
 * Early/Mid/Late tier from the original owner's current roster-value rank.
 */
export function useLeaguePickResolutions() {
  const { data: ids } = useLeagueIds();
  const chain = ids?.chain ?? [];
  return useQuery({
    queryKey: ['league-pick-resolutions', chain.join(',') || 'none'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const map = await resolveAllPicks(chain);
      // Return a stable closure so callers read like `resolve(season, round, rosterId)`.
      return {
        map,
        resolve: (season: string | number, round: number, rosterId: number): PickResolution | undefined =>
          map.get(`${season}-${round}-${rosterId}`),
      };
    },
  });
}

/**
 * The pick-resolution engine, shared by {@link useLeaguePickResolutions},
 * {@link useTradeDetail}, and the cross-league feed. `pickFilter` lets a caller
 * resolve only a subset of picks (a single trade, or just the picks in the
 * feed's recent transactions) instead of the whole league. Exported so the
 * multi-league feed can resolve each dynasty chain independently — resolutions
 * are keyed `season-round-roster_id` with no league qualifier, so chains MUST
 * be resolved separately or picks from different leagues collide.
 */
export async function resolveAllPicks(
  chain: string[],
  pickFilter?: { season: string; round: number; roster_id: number }[]
): Promise<Map<string, PickResolution>> {
  const pickResolution = new Map<string, PickResolution>();

  // Which picks to resolve: a caller-supplied subset, or every traded pick in
  // the active dynasty (from the transactions table).
  let picks = pickFilter;
  if (!picks) {
    const txs = await fetchAllTransactions(chain);
    const seen = new Set<string>();
    picks = [];
    for (const tx of txs) {
      for (const p of txDraftPicks(tx.draft_picks)) {
        const key = `${p.season}-${p.round}-${p.roster_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        picks.push({ season: String(p.season), round: Number(p.round), roster_id: Number(p.roster_id) });
      }
    }
  }
  if (!picks.length) return pickResolution;

  const seasons = [...new Set(picks.map((p) => String(p.season)))];
  const [{ data: leagues }, { data: drafts }] = await Promise.all([
    supabase.from('leagues').select('league_id, season').in('league_id', chain).order('season', { ascending: false }),
    supabase.from('drafts').select('draft_id, league_id, season, status, draft_order, slot_to_roster_id').in('league_id', chain).in('season', seasons),
  ]);
  const currentLeagueId = leagues?.[0]?.league_id ?? null;

  // Seasons whose rookie draft has already happened (pick → real player).
  const completedSeasons = new Set<string>();
  (drafts || []).forEach((d) => { if (d.status === 'complete') completedSeasons.add(String(d.season)); });

  // One usable draft per completed season, with whatever slot maps we have.
  const draftBySeason = new Map<string, { draft_id: string; league_id: string; draft_order: Record<string, number> | null; slotToRoster: Record<string, number> | null }>();
  (drafts || []).forEach((d) => {
    if (d.status === 'complete' && !draftBySeason.has(String(d.season))) {
      draftBySeason.set(String(d.season), {
        draft_id: d.draft_id,
        league_id: d.league_id,
        draft_order: (d.draft_order as Record<string, number> | null) ?? null,
        slotToRoster: (d.slot_to_roster_id as Record<string, number> | null) ?? null,
      });
    }
  });

  // Board selections for those drafts, keyed (draft_id, round, slot).
  const boardIds = [...draftBySeason.values()].map((d) => d.draft_id);
  const board = new Map<string, string>();
  if (boardIds.length) {
    const rows = await fetchAllRows<{ draft_id: string; round: number; draft_slot: number | null; player_id: string | null }>((from, to) =>
      supabase.from('draft_picks').select('draft_id, round, draft_slot, player_id').in('draft_id', boardIds).range(from, to)
    );
    rows.forEach((r) => { if (r.player_id != null && r.draft_slot != null) board.set(`${r.draft_id}-${r.round}-${r.draft_slot}`, r.player_id); });
  }

  // Rosters for the draft leagues (roster→user) + current league (standings for future tiers).
  const leagueIds = [...new Set([...[...draftBySeason.values()].map((d) => d.league_id), currentLeagueId].filter(Boolean) as string[])];
  const rosterRows = leagueIds.length
    ? (await supabase.from('rosters').select('league_id, roster_id, owner_id, wins, losses, fpts, players').in('league_id', leagueIds)).data || []
    : [];
  const userByRoster = new Map<string, string>(); // `${league_id}-${roster_id}` → owner_id
  rosterRows.forEach((r) => { if (r.owner_id) userByRoster.set(`${r.league_id}-${r.roster_id}`, r.owner_id); });
  const currentRosters = rosterRows.filter((r) => r.league_id === currentLeagueId);

  // Project future-pick tier from the ORIGINAL owner's total roster value,
  // ranked against the league: weakest roster (lowest value) drafts earliest
  // → "Early"; strongest → "Late".
  const tierByRoster = new Map<number, string>();
  if (currentRosters.length) {
    const pvRows = await fetchAllRows<{ player_id: string; value: number }>((from, to) =>
      supabase.from('player_values').select('player_id, value').eq('source', VALUE_SOURCE).range(from, to)
    );
    const valMap = new Map(pvRows.map((v) => [v.player_id, v.value]));
    const totals = currentRosters.map((r) => ({
      rosterId: r.roster_id,
      total: (r.players || []).reduce((s: number, pid: string) => s + (valMap.get(pid) || 0), 0),
    }));
    totals.sort((a, b) => a.total - b.total); // lowest value first → earliest pick
    const n = totals.length;
    totals.forEach((t, i) => {
      tierByRoster.set(t.rosterId, i < n / 3 ? 'Early' : i < (2 * n) / 3 ? 'Mid' : 'Late');
    });
  }

  for (const p of picks) {
    const key = `${p.season}-${p.round}-${p.roster_id}`;
    const season = String(p.season);
    const draft = draftBySeason.get(season);
    if (draft) {
      // Prefer the authoritative slot→roster map; fall back to draft_order (user→slot).
      let slot: number | undefined;
      if (draft.slotToRoster) {
        const hit = Object.keys(draft.slotToRoster).find((s) => Number(draft.slotToRoster![s]) === Number(p.roster_id));
        if (hit) slot = Number(hit);
      }
      if (slot == null && draft.draft_order) {
        const user = userByRoster.get(`${draft.league_id}-${p.roster_id}`);
        const s = user ? draft.draft_order[user] : undefined;
        if (s != null) slot = s;
      }
      const playerId = slot != null ? board.get(`${draft.draft_id}-${p.round}-${slot}`) : undefined;
      if (playerId) { pickResolution.set(key, { playerId, slot, future: false }); continue; }
    }
    // A completed draft exists but we couldn't pin the slot → past, unresolved
    // (no projection; the draft already happened). Otherwise it's a future pick.
    if (completedSeasons.has(season)) {
      pickResolution.set(key, { future: false });
    } else {
      pickResolution.set(key, { tier: tierByRoster.get(Number(p.roster_id)) ?? 'Mid', future: true });
    }
  }

  return pickResolution;
}

/**
 * A single trade by transaction_id, plus:
 *  - `latestValue`: most-recent player_value_history value per involved player
 *    (fallback when a player is missing from the current TEP player_values table).
 *  - `pickResolution`: for each traded pick, either the player it was used on
 *    (past picks, resolved via draft_order) or its projected tier (future picks).
 */
export function useTradeDetail(transactionId: string | undefined) {
  const { data: ids } = useLeagueIds();
  const chain = ids?.chain ?? [];
  return useQuery({
    queryKey: ['trade-detail', transactionId, chain.join(',') || 'none'],
    enabled: !!transactionId,
    queryFn: async () => {
      const { data: transaction } = await supabase
        .from('transactions')
        .select('*')
        .eq('transaction_id', transactionId!)
        .maybeSingle();

      const latestValue = new Map<string, number>();
      const pickResolution = new Map<string, PickResolution>();
      if (!transaction) return { transaction: null, latestValue, pickResolution };

      const tx = transaction as TransactionRow;
      const picks = txDraftPicks(tx.draft_picks);

      // ── Resolve picks (shared engine, scoped to just this trade's picks) ──
      if (picks.length > 0) {
        const resolved = await resolveAllPicks(
          chain,
          picks.map((p) => ({ season: String(p.season), round: Number(p.round), roster_id: Number(p.roster_id) }))
        );
        resolved.forEach((v, k) => pickResolution.set(k, v));
      }

      // ── Latest history value per involved player (players + resolved picks) ──
      const involved = new Set<string>(Object.keys(playerMoves(tx.adds)));
      pickResolution.forEach((r) => { if (r.playerId) involved.add(r.playerId); });
      if (involved.size > 0) {
        const rows = await fetchAllRows<{ player_id: string; value: number; date: string }>((from, to) =>
          supabase
            .from('player_value_history')
            .select('player_id, value, date')
            .in('player_id', [...involved])
            .eq('source', VALUE_SOURCE)
            .order('date', { ascending: false })
            .range(from, to)
        );
        for (const r of rows) if (!latestValue.has(r.player_id)) latestValue.set(r.player_id, r.value);
      }

      return { transaction: tx, latestValue, pickResolution };
    },
  });
}

/** All trades involving a roster, across every season of the active dynasty. */
export function useTeamTrades(rosterId: number | undefined) {
  const { data: ids } = useLeagueIds();
  const chain = ids?.chain ?? [];
  return useQuery({
    queryKey: ['team-trades', rosterId, chain.join(',') || 'none'],
    enabled: rosterId !== undefined,
    queryFn: async () => {
      // roster_id 1..N repeats in every league, so scope to the active chain
      // or a roster N in another dynasty would surface here.
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .in('league_id', chain)
        .eq('type', 'trade')
        .eq('status', 'complete')
        .contains('roster_ids', [rosterId!])
        .order('created', { ascending: true });
      return (data || []) as TransactionRow[];
    },
  });
}

/** Non-trade moves (waivers, free-agent adds/drops) for one roster, newest first. */
export function useTeamMoves(rosterId: number | undefined) {
  const { data: ids } = useLeagueIds();
  const chain = ids?.chain ?? [];
  return useQuery({
    queryKey: ['team-moves', rosterId, chain.join(',') || 'none'],
    enabled: rosterId !== undefined,
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .in('league_id', chain)
        .neq('type', 'trade')
        .contains('roster_ids', [rosterId!])
        .order('created', { ascending: false });
      return (data || []) as TransactionRow[];
    },
  });
}
