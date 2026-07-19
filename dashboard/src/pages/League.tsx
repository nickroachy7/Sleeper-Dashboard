import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Users, ChevronRight, Flame, ListOrdered, Swords, ArrowLeftRight, Layers, History as HistoryIcon } from 'lucide-react';
import { TabBar } from '../components/TabBar';
import { SectionCard } from '../components/SectionCard';
import { MyTeamPicker } from '../components/MyTeamCard';
import { NoLeagueState } from '../components/NoLeagueState';
import { TransactionsPanel } from './Transactions';
import { DraftsPanel } from './Drafts';
import { useLeagueDirectory } from '../hooks/detail';
import { useLeagueMatchups, type MatchupRow } from '../hooks/league';
import { useNflState } from '../hooks/queries';
import { useTeamStrength } from '../hooks/useTeamStrength';
import { useMyTeam } from '../hooks/useMyTeam';
import { useUrlState } from '../hooks/useUrlState';
import { useActiveLeague } from '../lib/active-league';

// ── Types ───────────────────────────────────────────────────────────

type LeagueTab = 'standings' | 'scoreboard' | 'transactions' | 'drafts' | 'history';

const LEAGUE_TABS = [
  { id: 'standings' as const, label: 'Standings', icon: ListOrdered },
  { id: 'scoreboard' as const, label: 'Matchups', icon: Swords },
  { id: 'transactions' as const, label: 'Transactions', icon: ArrowLeftRight },
  { id: 'drafts' as const, label: 'Drafts', icon: Layers },
  { id: 'history' as const, label: 'History', icon: HistoryIcon },
];

interface DirRoster {
  league_id: string;
  roster_id: number;
  owner_id: string | null;
  players: string[] | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  fpts: number | string | null;
  fpts_against: number | string | null;
}

interface StandingRow {
  rank: number;
  rosterId: number;
  name: string;
  avatar: string | null;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
  streak: string; // "W3" | "L2" | "T1" | "—"
  expWins: number; // expected wins from all-play (luck-neutral)
  expLosses: number;
  luck: number; // actual wins − expected wins (+ = lucky, − = unlucky)
  hasExp: boolean; // whether all-play data was available
}

interface GameSide {
  rosterId: number;
  points: number;
}
interface Game {
  leagueId: string;
  season: string;
  week: number;
  a: GameSide;
  b: GameSide;
}

// ── Helpers ─────────────────────────────────────────────────────────

const num = (v: number | string | null | undefined): number => (v == null ? 0 : Number(v) || 0);
const fmtPts = (n: number): string => Math.round(n).toLocaleString();

/** Sort rosters into standings order: wins, then points-for. */
function standingsOrder(rosters: DirRoster[]): DirRoster[] {
  return [...rosters].sort(
    (a, b) => num(b.wins) - num(a.wins) || num(b.fpts) - num(a.fpts)
  );
}

/** Pair matchup rows for one league into head-to-head games (2 sides each). */
function pairGames(rows: MatchupRow[], season: string): Game[] {
  const byKey = new Map<string, MatchupRow[]>();
  for (const m of rows) {
    if (m.matchup_id == null || m.points == null) continue;
    const key = `${m.week}-${m.matchup_id}`;
    const arr = byKey.get(key) || [];
    arr.push(m);
    byKey.set(key, arr);
  }
  const games: Game[] = [];
  for (const [, pair] of byKey) {
    if (pair.length !== 2) continue;
    const [x, y] = pair;
    games.push({
      leagueId: x.league_id,
      season,
      week: x.week,
      a: { rosterId: x.roster_id, points: num(x.points) },
      b: { rosterId: y.roster_id, points: num(y.points) },
    });
  }
  return games;
}

// ── Page ────────────────────────────────────────────────────────────

export default function League() {
  const { hasLeague } = useActiveLeague();
  const { data: directory, isLoading } = useLeagueDirectory();
  const { data: matchups } = useLeagueMatchups();
  const { data: nfl } = useNflState();
  const { byRoster: teamStrength } = useTeamStrength();
  const { rosterId: myRosterId } = useMyTeam();
  const { get, set } = useUrlState();

  const reqTab = get('tab');
  const activeTab: LeagueTab =
    reqTab === 'scoreboard' ? 'scoreboard'
    : reqTab === 'transactions' ? 'transactions'
    : reqTab === 'drafts' ? 'drafts'
    : reqTab === 'history' ? 'history'
    : 'standings';

  // Seasons in the dynasty, newest first, flagged by whether they've kicked off.
  const seasons = useMemo(() => {
    if (!directory) return [] as { leagueId: string; season: string; started: boolean }[];
    return directory.leagues.map((lg) => {
      const rs = (directory.rosters as DirRoster[]).filter((r) => r.league_id === lg.league_id);
      const started = rs.some((r) => num(r.wins) + num(r.losses) + num(r.ties) > 0);
      return { leagueId: lg.league_id, season: lg.season, started };
    });
  }, [directory]);

  // The season the standings/scoreboard default to: newest one that's actually
  // been played (so an unstarted offseason season doesn't show empty), falling
  // back to the current league.
  const defaultLeagueId = useMemo(() => {
    const played = seasons.find((s) => s.started);
    return played?.leagueId ?? directory?.currentLeagueId ?? seasons[0]?.leagueId ?? null;
  }, [seasons, directory]);

  const requestedSeason = get('season');
  const selectedLeagueId = useMemo(() => {
    if (requestedSeason) {
      const hit = seasons.find((s) => s.season === requestedSeason);
      if (hit) return hit.leagueId;
    }
    return defaultLeagueId;
  }, [requestedSeason, seasons, defaultLeagueId]);
  const selectedSeason = seasons.find((s) => s.leagueId === selectedLeagueId)?.season ?? '';

  const matchupsByLeague = useMemo(() => {
    const map = new Map<string, MatchupRow[]>();
    for (const m of matchups ?? []) {
      const arr = map.get(m.league_id) || [];
      arr.push(m);
      map.set(m.league_id, arr);
    }
    return map;
  }, [matchups]);

  // ── Standings (selected season) ──────────────────────────────────
  const standings = useMemo((): StandingRow[] => {
    if (!directory || !selectedLeagueId) return [];
    const rosters = (directory.rosters as DirRoster[]).filter((r) => r.league_id === selectedLeagueId);
    if (!rosters.length) return [];

    // Per-roster W/L/T results by week, for streaks, from paired matchups.
    const games = pairGames(matchupsByLeague.get(selectedLeagueId) ?? [], selectedSeason);
    const resultsByRoster = new Map<number, { week: number; r: 'W' | 'L' | 'T' }[]>();
    const push = (rid: number, week: number, r: 'W' | 'L' | 'T') => {
      const arr = resultsByRoster.get(rid) || [];
      arr.push({ week, r });
      resultsByRoster.set(rid, arr);
    };
    for (const g of games) {
      if (g.a.points === g.b.points) { push(g.a.rosterId, g.week, 'T'); push(g.b.rosterId, g.week, 'T'); }
      else if (g.a.points > g.b.points) { push(g.a.rosterId, g.week, 'W'); push(g.b.rosterId, g.week, 'L'); }
      else { push(g.a.rosterId, g.week, 'L'); push(g.b.rosterId, g.week, 'W'); }
    }
    const streakOf = (rid: number): string => {
      const arr = (resultsByRoster.get(rid) || []).sort((a, b) => a.week - b.week);
      if (!arr.length) return '—';
      const last = arr[arr.length - 1].r;
      let n = 0;
      for (let i = arr.length - 1; i >= 0 && arr[i].r === last; i--) n++;
      return `${last}${n}`;
    };

    // All-play (luck-neutral) record: each week, compare every team to every
    // other team that scored. A team's expected wins = all-play win% × games,
    // so the gap vs actual wins is schedule luck — a read Sleeper never shows.
    const rawRows = matchupsByLeague.get(selectedLeagueId) ?? [];
    const byWeek = new Map<number, { rosterId: number; points: number }[]>();
    for (const m of rawRows) {
      if (m.points == null) continue;
      const arr = byWeek.get(m.week) || [];
      arr.push({ rosterId: m.roster_id, points: num(m.points) });
      byWeek.set(m.week, arr);
    }
    const allPlay = new Map<number, { out: number; comp: number }>();
    for (const [, wk] of byWeek) {
      for (const a of wk) {
        const rec = allPlay.get(a.rosterId) || { out: 0, comp: 0 };
        for (const b of wk) {
          if (b.rosterId === a.rosterId) continue;
          rec.comp++;
          if (a.points > b.points) rec.out++;
          else if (a.points === b.points) rec.out += 0.5;
        }
        allPlay.set(a.rosterId, rec);
      }
    }

    return standingsOrder(rosters).map((r, i) => {
      const wins = num(r.wins), losses = num(r.losses), ties = num(r.ties);
      const games = wins + losses + ties;
      const ap = allPlay.get(r.roster_id);
      const hasExp = !!ap && ap.comp > 0 && games > 0;
      const pct = hasExp ? ap!.out / ap!.comp : 0;
      const expWins = hasExp ? Math.round(pct * games) : 0;
      return {
        rank: i + 1,
        rosterId: r.roster_id,
        name: directory.teamName(r.roster_id, selectedLeagueId),
        avatar: directory.teamAvatar(r.roster_id, selectedLeagueId),
        wins,
        losses,
        ties,
        pf: num(r.fpts),
        pa: num(r.fpts_against),
        streak: streakOf(r.roster_id),
        expWins,
        expLosses: games - expWins,
        luck: wins - expWins,
        hasExp,
      };
    });
  }, [directory, selectedLeagueId, selectedSeason, matchupsByLeague]);
  const showExpected = standings.some((s) => s.hasExp);
  // Team strength ranks CURRENT rosters, so the Power column only applies when
  // the standings are showing the current season.
  const showPower = selectedLeagueId === directory?.currentLeagueId && teamStrength.size > 0;

  // ── Scoreboard (selected season + week) ──────────────────────────
  const seasonGames = useMemo(
    () => pairGames(matchupsByLeague.get(selectedLeagueId ?? '') ?? [], selectedSeason),
    [matchupsByLeague, selectedLeagueId, selectedSeason]
  );
  const weeks = useMemo(
    () => [...new Set(seasonGames.map((g) => g.week))].sort((a, b) => a - b),
    [seasonGames]
  );
  const requestedWeek = Number(get('week'));
  const selectedWeek = useMemo(() => {
    if (requestedWeek && weeks.includes(requestedWeek)) return requestedWeek;
    // Default to the current NFL week if it has games, else the latest played.
    if (nfl?.week && weeks.includes(nfl.week)) return nfl.week;
    return weeks[weeks.length - 1] ?? 0;
  }, [requestedWeek, weeks, nfl]);
  const weekGames = useMemo(
    () => seasonGames.filter((g) => g.week === selectedWeek).sort((a, b) => b.a.points + b.b.points - (a.a.points + a.b.points)),
    [seasonGames, selectedWeek]
  );

  // ── Record book (all played seasons) ─────────────────────────────
  const records = useMemo(() => {
    if (!directory) return null;
    const allGames: Game[] = [];
    for (const s of seasons) {
      if (!s.started) continue;
      allGames.push(...pairGames(matchupsByLeague.get(s.leagueId) ?? [], s.season));
    }
    if (!allGames.length) return null;

    // Flatten into per-team-game rows (each game contributes two rows).
    interface TeamGame { rosterId: number; leagueId: string; season: string; week: number; pts: number; oppPts: number; won: boolean; }
    const teamGames: TeamGame[] = [];
    for (const g of allGames) {
      teamGames.push({ rosterId: g.a.rosterId, leagueId: g.leagueId, season: g.season, week: g.week, pts: g.a.points, oppPts: g.b.points, won: g.a.points > g.b.points });
      teamGames.push({ rosterId: g.b.rosterId, leagueId: g.leagueId, season: g.season, week: g.week, pts: g.b.points, oppPts: g.a.points, won: g.b.points > g.a.points });
    }
    const scored = teamGames.filter((t) => t.pts > 0);
    const name = (r: TeamGame) => directory.teamName(r.rosterId, r.leagueId);

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

    interface Rec { label: string; value: string; who: string; rosterId: number; leagueId: string; when: string; }
    const recs: (Rec | null)[] = [
      highGame && { label: 'Highest single game', value: `${highGame.pts.toFixed(1)} pts`, who: name(highGame), rosterId: highGame.rosterId, leagueId: highGame.leagueId, when: `${highGame.season} · Wk ${highGame.week}` },
      lowGame && { label: 'Lowest single game', value: `${lowGame.pts.toFixed(1)} pts`, who: name(lowGame), rosterId: lowGame.rosterId, leagueId: lowGame.leagueId, when: `${lowGame.season} · Wk ${lowGame.week}` },
      blowout && { label: 'Biggest blowout', value: `${Math.abs(blowout.a.points - blowout.b.points).toFixed(1)} margin`, who: directory.teamName(winnerSide(blowout).rosterId, blowout.leagueId), rosterId: winnerSide(blowout).rosterId, leagueId: blowout.leagueId, when: `over ${directory.teamName(loserSide(blowout).rosterId, blowout.leagueId)} · ${blowout.season} Wk ${blowout.week}` },
      narrowest && { label: 'Narrowest win', value: `${Math.abs(narrowest.a.points - narrowest.b.points).toFixed(2)} margin`, who: directory.teamName(winnerSide(narrowest).rosterId, narrowest.leagueId), rosterId: winnerSide(narrowest).rosterId, leagueId: narrowest.leagueId, when: `over ${directory.teamName(loserSide(narrowest).rosterId, narrowest.leagueId)} · ${narrowest.season} Wk ${narrowest.week}` },
      highLoss && { label: 'Most points in a loss', value: `${highLoss.pts.toFixed(1)} pts`, who: name(highLoss), rosterId: highLoss.rosterId, leagueId: highLoss.leagueId, when: `${highLoss.season} · Wk ${highLoss.week}` },
      lowWin && { label: 'Fewest points in a win', value: `${lowWin.pts.toFixed(1)} pts`, who: name(lowWin), rosterId: lowWin.rosterId, leagueId: lowWin.leagueId, when: `${lowWin.season} · Wk ${lowWin.week}` },
      highCombined && { label: 'Highest combined total', value: `${(highCombined.a.points + highCombined.b.points).toFixed(1)} pts`, who: `${directory.teamName(highCombined.a.rosterId, highCombined.leagueId)} vs ${directory.teamName(highCombined.b.rosterId, highCombined.leagueId)}`, rosterId: highCombined.a.rosterId, leagueId: highCombined.leagueId, when: `${highCombined.season} · Wk ${highCombined.week}` },
    ];
    return recs.filter((r): r is Rec => r != null);
  }, [directory, seasons, matchupsByLeague]);

  // ── History: all-time managers + season roll-call ────────────────
  const history = useMemo(() => {
    if (!directory) return null;
    const played = seasons.filter((s) => s.started);

    interface Mgr { ownerId: string; rosterId: number; name: string; avatar: string | null; wins: number; losses: number; ties: number; pf: number; seasons: number; titles: number; pointsTitles: number; }
    const byOwner = new Map<string, Mgr>();
    const seasonRoll: { season: string; champRosterId: number; champLeagueId: string; champName: string; pointsRosterId: number; pointsName: string; pointsPf: number }[] = [];

    for (const s of played) {
      const rosters = (directory.rosters as DirRoster[]).filter((r) => r.league_id === s.leagueId);
      if (!rosters.length) continue;
      const ordered = standingsOrder(rosters);
      const champ = ordered[0];
      const pointsLeader = [...rosters].sort((a, b) => num(b.fpts) - num(a.fpts))[0];
      seasonRoll.push({
        season: s.season,
        champRosterId: champ.roster_id,
        champLeagueId: s.leagueId,
        champName: directory.teamName(champ.roster_id, s.leagueId),
        pointsRosterId: pointsLeader.roster_id,
        pointsName: directory.teamName(pointsLeader.roster_id, s.leagueId),
        pointsPf: num(pointsLeader.fpts),
      });

      for (const r of rosters) {
        const oid = r.owner_id || `roster-${s.leagueId}-${r.roster_id}`;
        const m = byOwner.get(oid) || {
          ownerId: oid, rosterId: r.roster_id, name: directory.teamName(r.roster_id, directory.currentLeagueId), avatar: directory.teamAvatar(r.roster_id, directory.currentLeagueId),
          wins: 0, losses: 0, ties: 0, pf: 0, seasons: 0, titles: 0, pointsTitles: 0,
        };
        m.wins += num(r.wins);
        m.losses += num(r.losses);
        m.ties += num(r.ties);
        m.pf += num(r.fpts);
        m.seasons += 1;
        if (r.roster_id === champ.roster_id) m.titles += 1;
        if (r.roster_id === pointsLeader.roster_id) m.pointsTitles += 1;
        // Prefer the manager's CURRENT team identity for display.
        const curName = directory.teamName(r.roster_id, directory.currentLeagueId);
        if (r.owner_id) { m.name = curName; }
        byOwner.set(oid, m);
      }
    }
    const managers = [...byOwner.values()].sort((a, b) => {
      const wpA = a.wins + a.losses + a.ties ? a.wins / (a.wins + a.losses + a.ties) : 0;
      const wpB = b.wins + b.losses + b.ties ? b.wins / (b.wins + b.losses + b.ties) : 0;
      return wpB - wpA || b.wins - a.wins;
    });
    return { managers, seasonRoll };
  }, [directory, seasons]);

  // ── Render ───────────────────────────────────────────────────────

  if (!hasLeague) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <NoLeagueState heading="Add your league to see the league hub"
          sub="Standings, weekly scoreboards, an all-time record book, and league history — for any Sleeper dynasty." compact />
      </div>
    );
  }

  if (isLoading || !directory) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-4">
        <div className="skeleton h-24 w-full rounded-2xl" />
        <div className="skeleton h-12 w-full rounded-xl" />
        <div className="skeleton h-96 w-full rounded-2xl" />
      </div>
    );
  }

  // Season pill selector (standings + scoreboard tabs).
  const showSeasonPills = (activeTab === 'standings' || activeTab === 'scoreboard') && seasons.filter((s) => s.started).length > 1;
  const seasonPills = (
    <div className="flex gap-1 flex-wrap">
      {seasons.filter((s) => s.started).map((s) => (
        <button
          key={s.leagueId}
          onClick={() => set('season', s.season === defaultSeasonName(seasons, defaultLeagueId) ? null : s.season)}
          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold tabular-nums transition-colors ${
            s.season === selectedSeason ? 'bg-accent-500 text-white' : 'text-[#75757f] hover:text-white bg-[#1b1b22]'
          }`}
        >
          {s.season}
        </button>
      ))}
    </div>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-4">
      {/* ── Section tabs (the nav already names the page; league/season context
          lives in the Standings card's season pills) ── */}
      <TabBar
        tabs={LEAGUE_TABS}
        active={activeTab}
        onChange={(id) => set('tab', id === 'standings' ? null : id)}
      />

      {/* ═══ STANDINGS ═══ */}
      {/* First-run only: prompt to pick a team. Once chosen there's no
          identity card — the visitor's own row is highlighted in the table
          below and links to their team page like any other. */}
      {activeTab === 'standings' && <MyTeamPicker />}
      {activeTab === 'standings' && (
        <SectionCard
          label="Standings"
          sub={`${selectedSeason} regular season · ranked by record${showExpected ? ' · Exp = luck-neutral all-play record' : ', then points'}`}
          right={showSeasonPills ? seasonPills : undefined}
          flush
        >
          {standings.length === 0 ? (
            <p className="text-[12px] text-[#60606a] px-4 sm:px-5 pb-5">
              No standings yet — the {selectedSeason} season hasn't started.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[560px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.1em] text-[#60606a] border-b border-[#1b1b22]">
                    <th className="font-bold py-2 pl-4 sm:pl-5 pr-2">#</th>
                    <th className="font-bold py-2 px-2">Team</th>
                    <th className="font-bold py-2 px-2 text-center">Record</th>
                    {showExpected && (
                      <th className="font-bold py-2 px-2 text-center" title="Expected record from all-play win% — how you'd do against everyone each week (luck-neutral)">Exp</th>
                    )}
                    {showPower && (
                      <th className="font-bold py-2 px-2 text-center" title="Power rank by weighted roster value (current rosters)">Pwr</th>
                    )}
                    <th className="font-bold py-2 px-2 text-right">PF</th>
                    <th className="font-bold py-2 px-2 text-right">PA</th>
                    <th className="font-bold py-2 px-2 pr-4 sm:pr-5 text-center">Streak</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((s, i) => {
                    const streakColor = s.streak.startsWith('W') ? 'text-accent-500' : s.streak.startsWith('L') ? 'text-red-400' : 'text-[#75757f]';
                    const playoffLine = i === Math.ceil(standings.length / 2) - 1; // rough top-half divider
                    const luckColor = s.luck >= 2 ? 'text-amber-400' : s.luck <= -2 ? 'text-sky-400' : 'text-[#75757f]';
                    const luckLabel = s.luck >= 2 ? `Lucky — ${s.luck} more win${s.luck !== 1 ? 's' : ''} than performance` : s.luck <= -2 ? `Unlucky — ${Math.abs(s.luck)} fewer win${Math.abs(s.luck) !== 1 ? 's' : ''} than performance` : 'Record matches performance';
                    // The visitor's own team (roster ids are stable across the
                    // season chain, so this holds on past seasons too).
                    const isMine = s.rosterId === myRosterId;
                    return (
                      <tr key={s.rosterId} className={`group border-b border-[#1b1b22] last:border-0 hover:bg-[#1b1b22] transition-colors ${isMine ? 'bg-accent-500/[0.06]' : ''} ${playoffLine ? 'shadow-[inset_0_-1px_0_rgba(34,197,94,0.25)]' : ''}`}>
                        <td className="py-2.5 pl-4 sm:pl-5 pr-2">
                          <span className={`font-display text-[13px] font-bold tabular-nums ${isMine ? 'text-accent-400' : 'text-[#75757f]'}`}>{s.rank}</span>
                        </td>
                        <td className="py-2.5 px-2">
                          <Link to={`/teams/${s.rosterId}`} className="flex items-center gap-2.5 min-w-0">
                            <span className="w-7 h-7 rounded-full overflow-hidden bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/10 flex items-center justify-center">
                              {s.avatar ? (
                                <img src={s.avatar} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                              ) : (
                                <Users className="h-3.5 w-3.5 text-[#60606a]" />
                              )}
                            </span>
                            <span className={`text-[13px] truncate group-hover:text-accent-400 transition-colors ${isMine ? 'font-bold text-white' : 'font-medium text-white'}`}>{s.name}</span>
                            {isMine && (
                              <span className="text-[9px] uppercase tracking-wide font-bold text-accent-400 bg-accent-500/15 px-1.5 py-0.5 rounded shrink-0">
                                You
                              </span>
                            )}
                          </Link>
                        </td>
                        <td className="py-2.5 px-2 text-center text-[13px] tabular-nums text-[#d6d6de]">
                          {s.wins}-{s.losses}{s.ties ? `-${s.ties}` : ''}
                        </td>
                        {showExpected && (
                          <td className="py-2.5 px-2 text-center text-[12px] tabular-nums" title={luckLabel}>
                            {s.hasExp ? <span className={luckColor}>{s.expWins}-{s.expLosses}</span> : <span className="text-[#4c4c56]">—</span>}
                          </td>
                        )}
                        {showPower && (
                          <td className="py-2.5 px-2 text-center text-[12px] tabular-nums" title="Power rank by weighted roster value">
                            {teamStrength.get(s.rosterId) ? <span className="text-[#c4c4cd]">#{teamStrength.get(s.rosterId)!.rank}</span> : <span className="text-[#4c4c56]">—</span>}
                          </td>
                        )}
                        <td className="py-2.5 px-2 text-right text-[12px] tabular-nums text-[#9c9ca7]">{fmtPts(s.pf)}</td>
                        <td className="py-2.5 px-2 text-right text-[12px] tabular-nums text-[#75757f]">{fmtPts(s.pa)}</td>
                        <td className={`py-2.5 px-2 pr-4 sm:pr-5 text-center text-[12px] font-semibold tabular-nums ${streakColor}`}>{s.streak}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* ═══ SCOREBOARD ═══ */}
      {activeTab === 'scoreboard' && (
        <SectionCard
          label="Matchups"
          sub={weeks.length ? `${selectedSeason} · Week ${selectedWeek}` : `${selectedSeason} season`}
          right={showSeasonPills ? seasonPills : undefined}
          flush
        >
          {weeks.length === 0 ? (
            <p className="text-[12px] text-[#60606a] px-4 sm:px-5 pb-5">
              No games played yet this season.
            </p>
          ) : (
            <>
              {/* Week rail */}
              <div className="flex gap-1 overflow-x-auto no-scrollbar px-4 sm:px-5 pb-3">
                {weeks.map((w) => (
                  <button
                    key={w}
                    onClick={() => set('week', w === (nfl?.week && weeks.includes(nfl.week) ? nfl.week : weeks[weeks.length - 1]) ? null : String(w))}
                    className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] font-semibold tabular-nums transition-colors ${
                      w === selectedWeek ? 'bg-accent-500 text-white' : 'text-[#75757f] hover:text-white bg-[#1b1b22]'
                    }`}
                  >
                    Wk {w}
                  </button>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-2 px-4 sm:px-5 pb-4">
                {weekGames.map((g, idx) => {
                  const aWin = g.a.points > g.b.points;
                  const bWin = g.b.points > g.a.points;
                  const row = (side: GameSide, win: boolean) => (
                    <Link to={`/teams/${side.rosterId}`} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-[#1b1b22] transition-colors group">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-6 h-6 rounded-full overflow-hidden bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/10 flex items-center justify-center">
                          {directory.teamAvatar(side.rosterId, selectedLeagueId) ? (
                            <img src={directory.teamAvatar(side.rosterId, selectedLeagueId)!} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                          ) : (
                            <Users className="h-3 w-3 text-[#60606a]" />
                          )}
                        </span>
                        <span className={`text-[12.5px] truncate group-hover:text-accent-400 transition-colors ${win ? 'text-white font-semibold' : 'text-[#9c9ca7]'}`}>
                          {directory.teamName(side.rosterId, selectedLeagueId)}
                        </span>
                      </span>
                      <span className={`font-display text-[13px] font-bold tabular-nums shrink-0 ${win ? 'text-white' : 'text-[#75757f]'}`}>
                        {side.points.toFixed(1)}
                      </span>
                    </Link>
                  );
                  return (
                    <div key={idx} className="rounded-xl border border-[#22222b] bg-[#101015]/60 p-1.5">
                      {row(g.a, aWin)}
                      <div className="h-px bg-[#1b1b22] mx-3" />
                      {row(g.b, bWin)}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </SectionCard>
      )}

      {/* ═══ TRANSACTIONS ═══ */}
      {activeTab === 'transactions' && <TransactionsPanel />}

      {/* ═══ DRAFTS ═══ */}
      {activeTab === 'drafts' && <DraftsPanel />}

      {/* ═══ HISTORY: record book ═══ */}
      {activeTab === 'history' && (
        <SectionCard label="Record Book" sub="All-time single-game records across every dynasty season" flush>
          {!records || records.length === 0 ? (
            <p className="text-[12px] text-[#60606a] px-4 sm:px-5 pb-5">
              No games on record yet — records appear once weekly scores are synced.
            </p>
          ) : (
            <div className="divide-y divide-[#1b1b22]">
              {records.map((r) => (
                <Link key={r.label} to={`/teams/${r.rosterId}`} className="group flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-[#1b1b22] transition-colors">
                  <Trophy className="h-4 w-4 text-accent-500/70 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] uppercase tracking-[0.1em] text-[#75757f] font-bold">{r.label}</p>
                    <p className="text-[13px] text-white font-medium truncate group-hover:text-accent-400 transition-colors">
                      {r.who} <span className="text-[#60606a] font-normal">· {r.when}</span>
                    </p>
                  </div>
                  <span className="font-display text-[15px] font-bold tabular-nums text-white shrink-0">{r.value}</span>
                  <ChevronRight className="h-4 w-4 text-[#4c4c56] group-hover:text-accent-400 shrink-0 transition-colors" />
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* ═══ HISTORY ═══ */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* Season roll-call */}
          {history && history.seasonRoll.length > 0 && (
            <SectionCard label="Season by Season" sub="Regular-season points leader each year (playoff data not synced)" flush>
              <div className="divide-y divide-[#1b1b22]">
                {history.seasonRoll.map((s) => (
                  <div key={s.season} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                    <span className="font-display text-[15px] font-bold tabular-nums text-accent-400 w-12 shrink-0">{s.season}</span>
                    <Link to={`/teams/${s.pointsRosterId}`} className="min-w-0 flex-1 group">
                      <p className="text-[10px] uppercase tracking-[0.1em] text-[#75757f] font-bold flex items-center gap-1">
                        <Flame className="h-3 w-3 text-orange-400" /> Points leader
                      </p>
                      <p className="text-[13px] text-white font-medium truncate group-hover:text-accent-400 transition-colors">
                        {s.pointsName} <span className="text-[#60606a] font-normal">· {fmtPts(s.pointsPf)} pts</span>
                      </p>
                    </Link>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* All-time manager leaderboard */}
          {history && history.managers.length > 0 && (
            <SectionCard label="All-Time Managers" sub="Combined record across every synced season" flush>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[560px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-[0.1em] text-[#60606a] border-b border-[#1b1b22]">
                      <th className="font-bold py-2 pl-4 sm:pl-5 pr-2">#</th>
                      <th className="font-bold py-2 px-2">Manager</th>
                      <th className="font-bold py-2 px-2 text-center">Record</th>
                      <th className="font-bold py-2 px-2 text-right">Win%</th>
                      <th className="font-bold py-2 px-2 text-right">Total PF</th>
                      <th className="font-bold py-2 px-2 pr-4 sm:pr-5 text-center" title="Regular-season #1 finishes">Best</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.managers.map((m, i) => {
                      const gp = m.wins + m.losses + m.ties;
                      const wp = gp ? m.wins / gp : 0;
                      return (
                        <tr key={m.ownerId} className="group border-b border-[#1b1b22] last:border-0 hover:bg-[#1b1b22] transition-colors">
                          <td className="py-2.5 pl-4 sm:pl-5 pr-2 font-display text-[13px] font-bold tabular-nums text-[#75757f]">{i + 1}</td>
                          <td className="py-2.5 px-2">
                            <Link to={`/teams/${m.rosterId}`} className="flex items-center gap-2.5 min-w-0">
                              <span className="w-7 h-7 rounded-full overflow-hidden bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/10 flex items-center justify-center">
                                {m.avatar ? (
                                  <img src={m.avatar} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                                ) : (
                                  <Users className="h-3.5 w-3.5 text-[#60606a]" />
                                )}
                              </span>
                              <span className="text-[13px] font-medium text-white truncate group-hover:text-accent-400 transition-colors">{m.name}</span>
                            </Link>
                          </td>
                          <td className="py-2.5 px-2 text-center text-[13px] tabular-nums text-[#d6d6de]">{m.wins}-{m.losses}{m.ties ? `-${m.ties}` : ''}</td>
                          <td className="py-2.5 px-2 text-right text-[12px] tabular-nums text-[#9c9ca7]">{(wp * 100).toFixed(1)}%</td>
                          <td className="py-2.5 px-2 text-right text-[12px] tabular-nums text-[#75757f]">{fmtPts(m.pf)}</td>
                          <td className="py-2.5 px-2 pr-4 sm:pr-5 text-center text-[12px] tabular-nums text-[#9c9ca7]">
                            {m.titles > 0 ? <span className="text-accent-400 font-semibold">{m.titles}×</span> : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-[#60606a] px-4 sm:px-5 py-3">
                "Best" counts regular-season #1 finishes (by record, then points). Playoff/championship results aren't synced from Sleeper.
              </p>
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}

/** The season the pills treat as "default" (so selecting it clears the param). */
function defaultSeasonName(
  seasons: { leagueId: string; season: string; started: boolean }[],
  defaultLeagueId: string | null
): string {
  return seasons.find((s) => s.leagueId === defaultLeagueId)?.season ?? '';
}
