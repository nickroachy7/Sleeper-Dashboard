import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { playerMoves, txDraftPicks } from '../lib/trade-shared';
import { VALUE_SOURCE } from '../lib/value-source';
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
          supabase.from('league_users').select('league_id, user_id, team_name, display_name, avatar'),
        ]);

      const seasonByLeague = new Map<string, string>();
      (leagues || []).forEach((l) => seasonByLeague.set(l.league_id, l.season));
      const currentLeagueId = leagues?.[0]?.league_id ?? null;

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
        supabase.from('player_values').select('*').eq('player_id', pid).eq('source', VALUE_SOURCE).maybeSingle(),
        supabase.from('player_value_history').select('date, value').eq('player_id', pid).eq('source', VALUE_SOURCE).order('date', { ascending: true }),
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
  return useQuery({
    queryKey: ['season-ranks', ownerId],
    enabled: !!ownerId,
    queryFn: async (): Promise<SeasonRankPoint[]> => {
      const { data: leagues } = await supabase
        .from('leagues').select('league_id, season').order('season', { ascending: true });
      if (!leagues?.length) return [];

      const { data: rosters } = await supabase
        .from('rosters').select('league_id, roster_id, owner_id, players, wins, losses, fpts');

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

        // Power rank: sort by value desc.
        const powerRank = [...withVal].sort((a, b) => b.value - a.value)
          .findIndex((x) => x.roster.owner_id === ownerId) + 1;

        // Finish rank: wins then points. Null if no games played yet this season.
        const anyGames = leagueRosters.some((r) => (r.wins || 0) + (r.losses || 0) > 0);
        const finishRank = anyGames
          ? [...leagueRosters].sort((a, b) =>
              (b.wins || 0) - (a.wins || 0) || Number(b.fpts || 0) - Number(a.fpts || 0)
            ).findIndex((r) => r.owner_id === ownerId) + 1
          : null;

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
  return useQuery({
    queryKey: ['team-analytics', rosterId, ownerId],
    enabled: rosterId !== undefined && !!ownerId,
    queryFn: async (): Promise<TeamAnalytics> => {
      const [{ data: leagues }, { data: rosters }, players, pvRows, matchups] = await Promise.all([
        supabase.from('leagues').select('league_id, season').order('season', { ascending: true }),
        supabase.from('rosters').select('league_id, roster_id, owner_id, players'),
        fetchAllRows<{ player_id: string; position: string | null; age: number | null }>((from, to) =>
          supabase.from('players').select('player_id, position, age').range(from, to)),
        fetchAllRows<{ player_id: string; value: number }>((from, to) =>
          supabase.from('player_values').select('player_id, value').eq('source', VALUE_SOURCE).range(from, to)),
        fetchAllRows<{ league_id: string; week: number; roster_id: number; points: number | null; matchup_id: number | null }>((from, to) =>
          supabase.from('matchups').select('league_id, week, roster_id, points, matchup_id').range(from, to)),
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
  return useQuery({
    queryKey: ['league-pick-resolutions'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const map = await resolveAllPicks();
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
 * The pick-resolution engine, shared by {@link useLeaguePickResolutions} and
 * {@link useTradeDetail}. `pickFilter` lets a caller resolve only the picks of a
 * single trade (detail page) instead of the whole league.
 */
async function resolveAllPicks(
  pickFilter?: { season: string; round: number; roster_id: number }[]
): Promise<Map<string, PickResolution>> {
  const pickResolution = new Map<string, PickResolution>();

  // Which picks to resolve: a caller-supplied subset, or every traded pick in
  // the league (from the transactions table).
  let picks = pickFilter;
  if (!picks) {
    const txs = await fetchAllTransactions();
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
    supabase.from('leagues').select('league_id, season').order('season', { ascending: false }),
    supabase.from('drafts').select('draft_id, league_id, season, status, draft_order, slot_to_roster_id').in('season', seasons),
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
      const pickResolution = new Map<string, PickResolution>();
      if (!transaction) return { transaction: null, latestValue, pickResolution };

      const tx = transaction as TransactionRow;
      const picks = txDraftPicks(tx.draft_picks);

      // ── Resolve picks (shared engine, scoped to just this trade's picks) ──
      if (picks.length > 0) {
        const resolved = await resolveAllPicks(
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

/** Non-trade moves (waivers, free-agent adds/drops) for one roster, newest first. */
export function useTeamMoves(rosterId: number | undefined) {
  return useQuery({
    queryKey: ['team-moves', rosterId],
    enabled: rosterId !== undefined,
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .neq('type', 'trade')
        .contains('roster_ids', [rosterId!])
        .order('created', { ascending: false });
      return (data || []) as TransactionRow[];
    },
  });
}
