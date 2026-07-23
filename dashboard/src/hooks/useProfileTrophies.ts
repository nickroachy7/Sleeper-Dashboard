import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from './queries';

// ── Profile trophies (league achievements) ─────────────────────────
// A profile (/u/<username>) links to a Sleeper manager via
// profiles.sleeper_user_id → rosters.owner_id. Every league that manager plays
// in is publicly readable, so we can gather their whole career — seasons,
// records, weekly scores, trades — and derive earned/locked achievements from
// it. Achievements are computed ACROSS all their leagues (a profile isn't
// scoped to one dynasty); where an award ties to a specific season we surface
// the season + league in the detail line.
//
// Everything here is obtainable purely through playing in the league: finishing
// order, weekly scoring vs the field, win streaks, blowouts, and trade volume.
// No award depends on data Sleeper doesn't give us (there are no synced playoff
// brackets, so "champion" is the top of the final standings — wins, then
// points — the same convention the Records tab uses).

export type TrophyTier = 'gold' | 'silver' | 'bronze';

export interface Trophy {
  id: string;
  name: string;
  /** How you earn it — shown on the locked state and in the detail sheet. */
  how: string;
  tier: TrophyTier;
  /** Lucide icon key, mapped to a component in the UI. */
  icon: string;
  earned: boolean;
  /** Short context when earned, e.g. "2024 · Dynasty Reloaded" or "156.4 pts". */
  detail?: string;
  /** How many times earned (repeatable awards show a ×N badge). */
  count?: number;
  /** Progress hint on the locked state, e.g. "2 / 3 seasons" or "best: 4-game streak". */
  progress?: string;
}

// ── Career summary the awards are derived from ─────────────────────
interface CareerSeason {
  leagueId: string;
  leagueName: string;
  season: string;
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
  finish: number;      // 1 = first, by wins then points
  teams: number;
  pointsRank: number;  // 1 = most total points in the league that season
  started: boolean;
}

interface BigGame {
  points: number;
  season: string;
  leagueName: string;
  week: number;
  oppName: string;
  margin: number; // my points − opp points (negative = lost)
}

export interface ManagerCareer {
  linked: boolean;         // profile has a resolvable Sleeper owner_id
  hasData: boolean;        // the manager appears in at least one tracked league
  seasons: CareerSeason[];
  seasonsPlayed: number;
  titles: number;
  runnerUps: number;
  podiums: number;         // top-3 finishes
  playoffSeasons: number;  // top-half finishes
  pointsTitles: number;
  trades: number;
  weeklyHighs: number;     // weeks with the league's top score
  weeklyLows: number;      // weeks with the league's lowest score
  longestWinStreak: number;
  undefeatedSeasons: number;
  bestGame: BigGame | null;
  biggestWin: BigGame | null;    // largest winning margin
  narrowestLoss: BigGame | null; // smallest losing margin
  toughestLoss: BigGame | null;  // most points scored in a loss
  offTheChartsGame: BigGame | null; // a game ≥ 1.4× the manager's league-avg game
  topRivalWins: number;    // most wins vs a single opponent
  leagueAvgGame: number;   // reference scoring scale for relative awards
}

const num = (v: number | string | null | undefined): number => (v == null ? 0 : Number(v) || 0);

interface RosterRow {
  league_id: string;
  roster_id: number;
  owner_id: string | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  fpts: number | string | null;
}
interface LeagueRow { league_id: string; season: string; name: string; }
interface MatchRow { league_id: string; week: number; matchup_id: number | null; roster_id: number; points: number | null; }

async function buildCareer(ownerId: string): Promise<ManagerCareer> {
  const empty: ManagerCareer = {
    linked: true, hasData: false, seasons: [], seasonsPlayed: 0, titles: 0, runnerUps: 0,
    podiums: 0, playoffSeasons: 0, pointsTitles: 0, trades: 0, weeklyHighs: 0, weeklyLows: 0,
    longestWinStreak: 0, undefeatedSeasons: 0, bestGame: null, biggestWin: null,
    narrowestLoss: null, toughestLoss: null, offTheChartsGame: null, topRivalWins: 0, leagueAvgGame: 0,
  };

  // 1. Which leagues does this manager play in? (one roster per league they're in)
  const { data: myRosters } = await supabase
    .from('rosters')
    .select('league_id, roster_id')
    .eq('owner_id', ownerId);
  const myByLeague = new Map<string, number>();
  (myRosters ?? []).forEach((r) => myByLeague.set(r.league_id, r.roster_id));
  const leagueIds = [...myByLeague.keys()];
  if (!leagueIds.length) return empty;

  // 2. Everything for those leagues (all publicly readable).
  const [{ data: leagues }, { data: rostersRaw }, matchups, { data: tradesRaw }] = await Promise.all([
    supabase.from('leagues').select('league_id, season, name').in('league_id', leagueIds),
    supabase.from('rosters').select('league_id, roster_id, owner_id, wins, losses, ties, fpts').in('league_id', leagueIds),
    fetchAllRows<MatchRow>((from, to) =>
      supabase.from('matchups').select('league_id, week, matchup_id, roster_id, points').in('league_id', leagueIds).range(from, to)
    ),
    supabase.from('transactions').select('league_id, roster_ids').eq('type', 'trade').eq('status', 'complete').in('league_id', leagueIds),
  ]);

  const leagueById = new Map<string, LeagueRow>((leagues ?? []).map((l) => [l.league_id, l as LeagueRow]));
  const allRosters = (rostersRaw ?? []) as RosterRow[];
  // (league_id, roster_id) → owner_id, for rivalry tallies across seasons.
  const ownerOf = new Map<string, string>();
  allRosters.forEach((r) => { if (r.owner_id) ownerOf.set(`${r.league_id}-${r.roster_id}`, r.owner_id); });

  // ── Per-season standings, finish, and points rank ──
  const seasons: CareerSeason[] = [];
  for (const lid of leagueIds) {
    const lg = leagueById.get(lid);
    const mine = allRosters.find((r) => r.league_id === lid && r.owner_id === ownerId);
    if (!lg || !mine) continue;
    const leagueRosters = allRosters.filter((r) => r.league_id === lid);
    const started = leagueRosters.some((r) => num(r.wins) + num(r.losses) + num(r.ties) > 0);
    const standings = [...leagueRosters].sort((a, b) => num(b.wins) - num(a.wins) || num(b.fpts) - num(a.fpts));
    const finish = standings.findIndex((r) => r.roster_id === mine.roster_id) + 1;
    const pointsOrder = [...leagueRosters].sort((a, b) => num(b.fpts) - num(a.fpts));
    const pointsRank = pointsOrder.findIndex((r) => r.roster_id === mine.roster_id) + 1;
    seasons.push({
      leagueId: lid, leagueName: lg.name, season: lg.season,
      wins: num(mine.wins), losses: num(mine.losses), ties: num(mine.ties), fpts: num(mine.fpts),
      finish, teams: leagueRosters.length, pointsRank, started,
    });
  }
  seasons.sort((a, b) => b.season.localeCompare(a.season));
  const played = seasons.filter((s) => s.started);

  // ── Weekly analysis: high/low scores, streaks, blowouts, rivalries ──
  // Group by league+week (for league-wide high/low) and pair via matchup_id.
  const byLeagueWeek = new Map<string, MatchRow[]>();
  for (const m of matchups) {
    if (m.points == null) continue;
    const key = `${m.league_id}-${m.week}`;
    const arr = byLeagueWeek.get(key) || [];
    arr.push(m);
    byLeagueWeek.set(key, arr);
  }

  let weeklyHighs = 0, weeklyLows = 0;
  let bestGame: BigGame | null = null, biggestWin: BigGame | null = null;
  let narrowestLoss: BigGame | null = null, toughestLoss: BigGame | null = null;
  const rivalWins = new Map<string, number>();
  // Per-league ordered game results, to compute win streaks within a season.
  const seasonGames = new Map<string, { week: number; won: boolean }[]>();
  // Every scored team-week, to set the league-average scoring scale.
  let scoreSum = 0, scoreCount = 0;

  // Best-effort opponent display name: their team/display name in any league_user
  // row (populated first so nameFor can read it below).
  const rivalName = new Map<string, string>();
  {
    const { data: lus } = await supabase
      .from('league_users').select('user_id, team_name, display_name').in('league_id', leagueIds);
    (lus ?? []).forEach((u) => {
      if (u.team_name || u.display_name) rivalName.set(u.user_id, u.team_name || u.display_name || '');
    });
  }
  const nameFor = (leagueId: string, rosterId: number): string => {
    // Prefer the opponent's own-season name via the roster's owner; fall back to Team N.
    const oid = ownerOf.get(`${leagueId}-${rosterId}`);
    return (oid && rivalName.get(oid)) || `Team ${rosterId}`;
  };

  for (const [key, rows] of byLeagueWeek) {
    const [lid] = key.split('-');
    const myRoster = myByLeague.get(lid);
    if (myRoster == null) continue;
    const lg = leagueById.get(lid);
    const scored = rows.filter((r) => (r.points ?? 0) > 0);
    for (const r of scored) { scoreSum += r.points ?? 0; scoreCount++; }
    if (scored.length < 4) continue; // ignore thin/partial weeks for league-wide highs
    const weekMax = Math.max(...scored.map((r) => r.points ?? 0));
    const weekMin = Math.min(...scored.map((r) => r.points ?? 0));
    const myRow = rows.find((r) => r.roster_id === myRoster);
    if (!myRow || myRow.points == null || myRow.points <= 0) continue;
    const myPts = myRow.points;
    if (myPts === weekMax) weeklyHighs++;
    if (myPts === weekMin) weeklyLows++;

    // Head-to-head opponent this week.
    const opp = rows.find((r) => r.matchup_id != null && r.matchup_id === myRow.matchup_id && r.roster_id !== myRoster);
    if (!opp || opp.points == null) continue;
    const oppPts = opp.points;
    const won = myPts > oppPts;
    const tied = myPts === oppPts;
    const margin = myPts - oppPts;
    const oppName = nameFor(lid, opp.roster_id);
    const g: BigGame = { points: myPts, season: lg?.season ?? '', leagueName: lg?.name ?? '', week: myRow.week, oppName, margin };

    if (!bestGame || myPts > bestGame.points) bestGame = g;
    if (won && (!biggestWin || margin > biggestWin.margin)) biggestWin = g;
    if (!won && !tied) {
      if (!narrowestLoss || Math.abs(margin) < Math.abs(narrowestLoss.margin)) narrowestLoss = g;
      if (!toughestLoss || myPts > toughestLoss.points) toughestLoss = g;
    }

    const arr = seasonGames.get(lid) || [];
    arr.push({ week: myRow.week, won });
    seasonGames.set(lid, arr);

    if (won) {
      const oid = ownerOf.get(`${lid}-${opp.roster_id}`);
      if (oid) rivalWins.set(oid, (rivalWins.get(oid) ?? 0) + 1);
    }
  }

  // Longest win streak across any single season.
  let longestWinStreak = 0;
  for (const [, games] of seasonGames) {
    games.sort((a, b) => a.week - b.week);
    let run = 0;
    for (const g of games) {
      run = g.won ? run + 1 : 0;
      if (run > longestWinStreak) longestWinStreak = run;
    }
  }

  const leagueAvgGame = scoreCount ? scoreSum / scoreCount : 0;
  // "Off the charts" = a game ≥ 1.4× the league's average team-week — a genuine
  // explosion relative to THIS league's scoring, so it's robust across formats.
  const offTheChartsGame = bestGame && leagueAvgGame > 0 && bestGame.points >= leagueAvgGame * 1.4 ? bestGame : null;

  const titles = played.filter((s) => s.finish === 1).length;
  const runnerUps = played.filter((s) => s.finish === 2).length;
  const podiums = played.filter((s) => s.finish <= 3).length;
  const playoffSeasons = played.filter((s) => s.finish <= Math.ceil(s.teams / 2)).length;
  const pointsTitles = played.filter((s) => s.pointsRank === 1).length;
  const undefeatedSeasons = played.filter((s) => s.losses === 0 && s.wins >= 6).length;

  // Trades this manager was a party to (roster_ids carry per-league roster ids).
  let trades = 0;
  for (const tx of tradesRaw ?? []) {
    const rid = myByLeague.get((tx as { league_id: string }).league_id);
    const ids = ((tx as { roster_ids: number[] | null }).roster_ids) ?? [];
    if (rid != null && ids.includes(rid)) trades++;
  }

  const topRivalWins = rivalWins.size ? Math.max(...rivalWins.values()) : 0;

  return {
    linked: true, hasData: true, seasons, seasonsPlayed: played.length,
    titles, runnerUps, podiums, playoffSeasons, pointsTitles, trades,
    weeklyHighs, weeklyLows, longestWinStreak, undefeatedSeasons,
    bestGame, biggestWin, narrowestLoss, toughestLoss, offTheChartsGame,
    topRivalWins, leagueAvgGame,
  };
}

// ── Award catalog ──────────────────────────────────────────────────
// Each award is a pure function of the career summary. Ordered gold → bronze
// within the display, but earned-first sorting happens in the UI.
function deriveTrophies(c: ManagerCareer): Trophy[] {
  const seasonOf = (predicate: (s: CareerSeason) => boolean, sort?: (a: CareerSeason, b: CareerSeason) => number): CareerSeason | undefined => {
    const hits = c.seasons.filter((s) => s.started && predicate(s));
    return sort ? [...hits].sort(sort)[0] : hits[0];
  };
  const where = (s?: CareerSeason) => (s ? `${s.season} · ${s.leagueName}` : undefined);
  const gameLine = (g: BigGame | null) => (g ? `${g.points.toFixed(1)} pts · ${g.season}` : undefined);

  const champSeason = seasonOf((s) => s.finish === 1);
  const runnerSeason = seasonOf((s) => s.finish === 2);
  const podiumSeason = seasonOf((s) => s.finish <= 3, (a, b) => a.finish - b.finish);
  const playoffSeason = seasonOf((s) => s.finish <= Math.ceil(s.teams / 2), (a, b) => a.finish - b.finish);
  const pointsSeason = seasonOf((s) => s.pointsRank === 1);
  const undefeatedSeason = seasonOf((s) => s.losses === 0 && s.wins >= 6);

  const defs: Trophy[] = [
    // ── Gold ──
    {
      id: 'champion', name: 'League Champ', tier: 'gold', icon: 'trophy',
      how: 'Finish 1st in the final league standings.',
      earned: c.titles > 0, count: c.titles || undefined, detail: where(champSeason),
    },
    {
      id: 'points-crown', name: 'Points Savage', tier: 'gold', icon: 'flame',
      how: 'Lead your league in total points across a season.',
      earned: c.pointsTitles > 0, count: c.pointsTitles || undefined, detail: where(pointsSeason),
    },
    {
      id: 'flawless', name: 'Never Took An L', tier: 'gold', icon: 'shield',
      how: 'Finish a season without a single loss.',
      earned: c.undefeatedSeasons > 0, count: c.undefeatedSeasons || undefined, detail: where(undefeatedSeason),
    },
    {
      id: 'off-the-charts', name: 'Off The Charts', tier: 'gold', icon: 'zap',
      how: 'Post a single-week score 40% above your league average.',
      earned: !!c.offTheChartsGame, detail: gameLine(c.offTheChartsGame),
      progress: !c.offTheChartsGame && c.bestGame && c.leagueAvgGame > 0
        ? `best: ${c.bestGame.points.toFixed(0)} vs ${(c.leagueAvgGame * 1.4).toFixed(0)} needed` : undefined,
    },
    // ── Silver ──
    {
      id: 'runner-up', name: 'Runner Up', tier: 'silver', icon: 'medal',
      how: 'Finish 2nd in the final standings.',
      earned: c.runnerUps > 0, count: c.runnerUps || undefined, detail: where(runnerSeason),
    },
    {
      id: 'weekly-mvp', name: 'MVFP', tier: 'silver', icon: 'crown',
      how: 'Post the single highest score in your league in a week.',
      earned: c.weeklyHighs > 0, count: c.weeklyHighs || undefined,
      detail: c.weeklyHighs ? `${c.weeklyHighs} top-scoring week${c.weeklyHighs === 1 ? '' : 's'}` : undefined,
    },
    {
      id: 'on-fire', name: 'On Fire', tier: 'silver', icon: 'trending-up',
      how: 'Win 5 games in a row in a single season.',
      earned: c.longestWinStreak >= 5, detail: c.longestWinStreak >= 5 ? `${c.longestWinStreak}-game win streak` : undefined,
      progress: c.longestWinStreak < 5 && c.longestWinStreak > 0 ? `best: ${c.longestWinStreak} / 5` : undefined,
    },
    {
      id: 'no-mercy', name: 'No Mercy', tier: 'silver', icon: 'swords',
      how: 'Win a matchup by 50 or more points.',
      earned: !!c.biggestWin && c.biggestWin.margin >= 50,
      detail: c.biggestWin && c.biggestWin.margin >= 50 ? `+${c.biggestWin.margin.toFixed(1)} vs ${c.biggestWin.oppName}` : undefined,
      progress: c.biggestWin && c.biggestWin.margin < 50 ? `best: +${c.biggestWin.margin.toFixed(0)} / 50` : undefined,
    },
    {
      id: 'kryptonite', name: 'Kryptonite', tier: 'silver', icon: 'target',
      how: 'Beat the same manager 5 times all-time.',
      earned: c.topRivalWins >= 5, detail: c.topRivalWins >= 5 ? `${c.topRivalWins} wins over one rival` : undefined,
      progress: c.topRivalWins < 5 && c.topRivalWins > 0 ? `best: ${c.topRivalWins} / 5` : undefined,
    },
    {
      id: 'tough-luck', name: 'Tough Luck', tier: 'silver', icon: 'heart-crack',
      how: 'Score 30% above your league average and still lose.',
      earned: !!c.toughestLoss && c.leagueAvgGame > 0 && c.toughestLoss.points >= c.leagueAvgGame * 1.3,
      detail: c.toughestLoss && c.leagueAvgGame > 0 && c.toughestLoss.points >= c.leagueAvgGame * 1.3
        ? `${c.toughestLoss.points.toFixed(1)} in a loss` : undefined,
    },
    // ── Bronze ──
    {
      id: 'playoff-bound', name: 'Playoff Bound', tier: 'bronze', icon: 'sparkles',
      how: 'Finish in the top half of your league.',
      earned: c.playoffSeasons > 0, count: c.playoffSeasons || undefined, detail: where(playoffSeason),
    },
    {
      id: 'podium', name: 'Bronze Boss', tier: 'bronze', icon: 'award',
      how: 'Finish in the top 3 of the standings.',
      earned: c.podiums > 0, count: c.podiums || undefined, detail: where(podiumSeason),
    },
    {
      id: 'veteran', name: 'Ironman', tier: 'bronze', icon: 'hourglass',
      how: 'Play 3 or more full seasons.',
      earned: c.seasonsPlayed >= 3, detail: c.seasonsPlayed >= 3 ? `${c.seasonsPlayed} seasons` : undefined,
      progress: c.seasonsPlayed < 3 ? `${c.seasonsPlayed} / 3 seasons` : undefined,
    },
    {
      id: 'dealmaker', name: 'Wheeler Dealer', tier: 'bronze', icon: 'arrow-right-left',
      how: 'Complete 10 or more trades.',
      earned: c.trades >= 10, detail: c.trades >= 10 ? `${c.trades} trades` : undefined,
      progress: c.trades < 10 ? `${c.trades} / 10 trades` : undefined,
    },
    {
      id: 'heartbreaker', name: 'Ice Cold', tier: 'bronze', icon: 'snowflake',
      how: 'Lose a matchup by fewer than 3 points.',
      earned: !!c.narrowestLoss && Math.abs(c.narrowestLoss.margin) < 3,
      detail: c.narrowestLoss && Math.abs(c.narrowestLoss.margin) < 3
        ? `lost by ${Math.abs(c.narrowestLoss.margin).toFixed(2)}` : undefined,
    },
    {
      id: 'basement', name: 'Points Machine', tier: 'bronze', icon: 'activity',
      how: 'Record your career-best single-game score.',
      earned: !!c.bestGame, detail: gameLine(c.bestGame),
    },
  ];

  return defs;
}

/**
 * Trophies for a profile, keyed by its linked Sleeper owner id. Returns the
 * full catalog (earned + locked) plus the underlying career summary, or a
 * not-linked state when the profile has no Sleeper connection yet.
 */
export function useProfileTrophies(sleeperUserId: string | null | undefined) {
  return useQuery({
    queryKey: ['profile-trophies', sleeperUserId ?? 'none'],
    enabled: sleeperUserId !== undefined, // run even when null, to return a linked:false state
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ career: ManagerCareer; trophies: Trophy[] }> => {
      if (!sleeperUserId) {
        const career: ManagerCareer = {
          linked: false, hasData: false, seasons: [], seasonsPlayed: 0, titles: 0, runnerUps: 0,
          podiums: 0, playoffSeasons: 0, pointsTitles: 0, trades: 0, weeklyHighs: 0, weeklyLows: 0,
          longestWinStreak: 0, undefeatedSeasons: 0, bestGame: null, biggestWin: null,
          narrowestLoss: null, toughestLoss: null, offTheChartsGame: null, topRivalWins: 0, leagueAvgGame: 0,
        };
        return { career, trophies: deriveTrophies(career) };
      }
      const career = await buildCareer(sleeperUserId);
      return { career, trophies: deriveTrophies(career) };
    },
  });
}
