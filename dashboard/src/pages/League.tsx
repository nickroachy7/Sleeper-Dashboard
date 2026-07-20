import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Users, ArrowLeftRight, Trophy } from 'lucide-react';
import { TabBar } from '../components/TabBar';
import { SectionCard } from '../components/SectionCard';
import { Segmented } from '../components/ui';
import { MyTeamPicker } from '../components/MyTeamCard';
import { NoLeagueState } from '../components/NoLeagueState';
import { LeagueSwitcher } from '../components/LeagueSwitcher';
import { HistoryPanel } from '../components/HistoryPanel';
import { TransactionsPanel } from './Transactions';
import { useLeagueDirectory } from '../hooks/detail';
import { useLeagueMatchups, pairGames, type MatchupRow } from '../hooks/league';
import { useTeamStrength } from '../hooks/useTeamStrength';
import { useMyTeam } from '../hooks/useMyTeam';
import { useUrlState } from '../hooks/useUrlState';
import { useActiveLeague } from '../lib/active-league';

// ── Types ───────────────────────────────────────────────────────────

type LeagueTab = 'standings' | 'transactions' | 'history';

// Weekly matchups live on each team's page (Schedule tab). "History" is the
// league's backward-looking hub: the all-time record book + manager leaderboard
// show immediately, with Drafts as a sub-page. Folding drafts + records under
// one tab keeps the row to three fully-labeled tabs on mobile. History is
// league-scoped (follows this page's league switcher), which is why it lives
// here rather than on the community Ranking page.
const LEAGUE_TABS = [
  // "Teams" is shorter than "Standings" (so the row fits "Transactions" in full)
  // but the tab still leads with the standings view — id stays 'standings'.
  { id: 'standings' as const, label: 'Teams', icon: Users },
  { id: 'transactions' as const, label: 'Transactions', icon: ArrowLeftRight },
  { id: 'history' as const, label: 'History', icon: Trophy },
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

// ── Helpers ─────────────────────────────────────────────────────────

const num = (v: number | string | null | undefined): number => (v == null ? 0 : Number(v) || 0);
const fmtPts = (n: number): string => Math.round(n).toLocaleString();

/** Sort rosters into standings order: wins, then points-for. */
function standingsOrder(rosters: DirRoster[]): DirRoster[] {
  return [...rosters].sort(
    (a, b) => num(b.wins) - num(a.wins) || num(b.fpts) - num(a.fpts)
  );
}

// ── Page ────────────────────────────────────────────────────────────

export default function League() {
  const { hasLeague } = useActiveLeague();
  const { data: directory, isLoading } = useLeagueDirectory();
  const { data: matchups } = useLeagueMatchups();
  const { byRoster: teamStrength } = useTeamStrength();
  const { rosterId: myRosterId } = useMyTeam();
  const { get, set, setMany } = useUrlState();

  const reqTab = get('tab');
  const activeTab: LeagueTab =
    reqTab === 'transactions' ? 'transactions'
    // Drafts + Records folded into History; old links land on the right view.
    : reqTab === 'history' || reqTab === 'records' || reqTab === 'drafts' ? 'history'
    : 'standings'; // old ?tab=scoreboard links land here too

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

  // Season pill selector (standings tab) — shared Segmented (compact/inline).
  const startedSeasons = seasons.filter((s) => s.started);
  const showSeasonPills = activeTab === 'standings' && startedSeasons.length > 1;
  const seasonPills = (
    <Segmented
      size="sm"
      layout="inline"
      value={selectedSeason}
      onChange={(season) => set('season', season === defaultSeasonName(seasons, defaultLeagueId) ? null : season)}
      options={startedSeasons.map((s) => ({ value: s.season, label: s.season }))}
    />
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-4">
      {/* ── League identity + switcher. This is the ONE place to switch leagues
          — the app chrome is league-neutral, so everything league-specific
          (including "which league am I viewing") lives on this page. ── */}
      <div className="rounded-2xl border border-line-subtle bg-white/[0.03] px-3 py-3 sm:px-4">
        <LeagueSwitcher />
      </div>

      {/* ── Section tabs ── */}
      <TabBar
        tabs={LEAGUE_TABS}
        active={activeTab}
        // Clear the History sub-view (?view) when switching tabs so it doesn't
        // persist onto Standings/Trades.
        onChange={(id) => setMany({ tab: id === 'standings' ? null : id, view: null })}
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
            <p className="text-[12px] text-ghost px-4 sm:px-5 pb-5">
              No standings yet — the {selectedSeason} season hasn't started.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[560px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.1em] text-ghost border-b border-line-subtle">
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
                    const streakColor = s.streak.startsWith('W') ? 'text-accent-500' : s.streak.startsWith('L') ? 'text-red-400' : 'text-faint';
                    const playoffLine = i === Math.ceil(standings.length / 2) - 1; // rough top-half divider
                    const luckColor = s.luck >= 2 ? 'text-amber-400' : s.luck <= -2 ? 'text-sky-400' : 'text-faint';
                    const luckLabel = s.luck >= 2 ? `Lucky — ${s.luck} more win${s.luck !== 1 ? 's' : ''} than performance` : s.luck <= -2 ? `Unlucky — ${Math.abs(s.luck)} fewer win${Math.abs(s.luck) !== 1 ? 's' : ''} than performance` : 'Record matches performance';
                    // The visitor's own team (roster ids are stable across the
                    // season chain, so this holds on past seasons too).
                    const isMine = s.rosterId === myRosterId;
                    return (
                      <tr key={s.rosterId} className={`group border-b border-line-subtle last:border-0 hover:bg-elevated transition-colors ${isMine ? 'bg-accent-500/[0.06]' : ''} ${playoffLine ? 'shadow-[inset_0_-1px_0_rgba(34,197,94,0.25)]' : ''}`}>
                        <td className="py-2.5 pl-4 sm:pl-5 pr-2">
                          <span className={`font-display text-[13px] font-bold tabular-nums ${isMine ? 'text-accent-400' : 'text-faint'}`}>{s.rank}</span>
                        </td>
                        <td className="py-2.5 px-2">
                          <Link to={`/teams/${s.rosterId}`} className="flex items-center gap-2.5 min-w-0">
                            <span className="w-7 h-7 rounded-full overflow-hidden bg-overlay shrink-0 ring-1 ring-inset ring-white/10 flex items-center justify-center">
                              {s.avatar ? (
                                <img src={s.avatar} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                              ) : (
                                <Users className="h-3.5 w-3.5 text-ghost" />
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
                        <td className="py-2.5 px-2 text-center text-[13px] tabular-nums text-ink-soft">
                          {s.wins}-{s.losses}{s.ties ? `-${s.ties}` : ''}
                        </td>
                        {showExpected && (
                          <td className="py-2.5 px-2 text-center text-[12px] tabular-nums" title={luckLabel}>
                            {s.hasExp ? <span className={luckColor}>{s.expWins}-{s.expLosses}</span> : <span className="text-[#4c4c56]">—</span>}
                          </td>
                        )}
                        {showPower && (
                          <td className="py-2.5 px-2 text-center text-[12px] tabular-nums" title="Power rank by weighted roster value">
                            {teamStrength.get(s.rosterId) ? <span className="text-ink-soft">#{teamStrength.get(s.rosterId)!.rank}</span> : <span className="text-[#4c4c56]">—</span>}
                          </td>
                        )}
                        <td className="py-2.5 px-2 text-right text-[12px] tabular-nums text-muted">{fmtPts(s.pf)}</td>
                        <td className="py-2.5 px-2 text-right text-[12px] tabular-nums text-faint">{fmtPts(s.pa)}</td>
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

      {/* ═══ TRANSACTIONS ═══ */}
      {activeTab === 'transactions' && <TransactionsPanel />}

      {/* ═══ HISTORY (record book + manager leaderboard, with Drafts sub-page) ═══ */}
      {activeTab === 'history' && <HistoryPanel initialView={reqTab === 'drafts' ? 'drafts' : undefined} />}
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
