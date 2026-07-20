import { useParams, Link, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { ArrowRightLeft, ChevronRight, Users, LayoutGrid, ListChecks, BarChart3, Sparkles, Swords, Target } from 'lucide-react';
import { ValueChart } from '../components/charts/ValueChart';
import { SeasonRankChart } from '../components/charts/SeasonRankChart';
import { TeamAnalyticsCharts } from '../components/charts/TeamAnalytics';
import { CHART_POS, CHART_NEG } from '../components/charts/theme';
import { PlayerRow } from '../components/PlayerRow';
import { StatTile } from '../components/StatTile';
import { SectionCard } from '../components/SectionCard';
import { TabBar } from '../components/TabBar';
import { Segmented } from '../components/ui';
import { useLeagueDirectory, useSeasonRanks, useTeamAnalytics, useTeamTrades, useTeamMoves, useLineupEfficiency, useHeadToHead, useTeamLineup } from '../hooks/detail';
import { useLeagueMatchups, pairGames } from '../hooks/league';
import { usePlayerMap } from '../hooks/useLeagueData';
import { usePlayerValuesList, usePickValues, useTradedPicks, useNflState } from '../hooks/queries';
import { useUrlState } from '../hooks/useUrlState';
import { playerMoves, txDraftPicks, lookupPickValue, calcWeightedPositionValue, buildPicksForRoster, POSITION_WEIGHT_TIERS, type RosterPosition } from '../lib/trade-shared';
import type { Roster } from '../types/domain';

type TeamTab = 'overview' | 'roster' | 'schedule' | 'analytics' | 'transactions';
const TEAM_TABS: { id: TeamTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'roster', label: 'Roster', icon: LayoutGrid },
  { id: 'schedule', label: 'Schedule', icon: Swords },
  { id: 'analytics', label: 'Analytics', icon: Sparkles },
  { id: 'transactions', label: 'Transactions', icon: ListChecks },
];

// Readable lineup-slot labels + which slots don't count as starting.
const SLOT_LABEL: Record<string, string> = {
  QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K', DEF: 'DEF',
  FLEX: 'FLEX', WRRB_FLEX: 'W/R', REC_FLEX: 'W/T', SUPER_FLEX: 'SFLX',
  DL: 'DL', LB: 'LB', DB: 'DB', IDP_FLEX: 'IDP',
};
const BENCH_SLOTS = new Set(['BN', 'TAXI', 'IR']);

const fmtVal = (n: number) => Math.round(n).toLocaleString();
const POSITIONS: RosterPosition[] = ['QB', 'RB', 'WR', 'TE'];

interface TradeLedgerEntry {
  txId: string;
  timestamp: number;
  season: string | null;
  partners: number[];
  playersIn: string[];
  playersOut: string[];
  picksIn: string[];
  picksOut: string[];
  valueIn: number;
  valueOut: number;
  net: number;
}

export default function TeamDetail() {
  const params = useParams<{ rosterId: string }>();
  const rosterId = Number(params.rosterId);
  const { data: directory, isLoading } = useLeagueDirectory();
  const { data: playersMap } = usePlayerMap();
  const { data: playerValues } = usePlayerValuesList();
  const { data: pickValues } = usePickValues();
  const { data: tradedPicks } = useTradedPicks(directory?.currentLeagueId ?? null);
  const { data: trades } = useTeamTrades(Number.isFinite(rosterId) ? rosterId : undefined);
  const { data: moves } = useTeamMoves(Number.isFinite(rosterId) ? rosterId : undefined);
  const [showFullRoster, setShowFullRoster] = useState(false);

  const { get, set } = useUrlState();
  const navigate = useNavigate();
  const activeTab = (TEAM_TABS.some((t) => t.id === get('tab')) ? get('tab') : 'overview') as TeamTab;

  // "Trade" → open the Evaluator with this team pre-selected on one side.
  const openTrade = () => {
    const sides = [
      { rosterId, assets: [] },
      { rosterId: 0, assets: [] },
    ];
    const league = get('league');
    navigate({ pathname: '/trade', search: league ? `?league=${league}` : '' }, { state: { initialTrade: { sides } } });
  };

  const currentRoster = useMemo(() => {
    if (!directory) return null;
    return directory.rosters.find(
      (r) => r.roster_id === rosterId && r.league_id === directory.currentLeagueId
    ) ?? null;
  }, [directory, rosterId]);

  // Per-season power rank (talent) vs finish rank (results).
  const { data: seasonRanks, isLoading: seasonLoading } = useSeasonRanks(currentRoster?.owner_id);
  // Deep analytics (contention window, scoring/luck, positional edge).
  const { data: analytics, isLoading: analyticsLoading } = useTeamAnalytics(
    Number.isFinite(rosterId) ? rosterId : undefined,
    currentRoster?.owner_id
  );
  // Coach rating: actual lineup output vs the best they could have set.
  const { data: lineup } = useLineupEfficiency(currentRoster?.owner_id);
  // All-time head-to-head record vs every other manager.
  const { data: h2h } = useHeadToHead(currentRoster?.owner_id);
  // Starting lineup + slots, to group the roster tab by lineup slot vs bench.
  const { data: teamLineup } = useTeamLineup(Number.isFinite(rosterId) ? rosterId : undefined);
  const { data: nfl } = useNflState();
  // All matchup rows across the dynasty — the Schedule tab filters to this team.
  const { data: allMatchups } = useLeagueMatchups();

  // ── Schedule: this team's games, one season at a time ──
  const scheduleSeasonReq = get('sseason');
  const scheduleSeasons = useMemo(() => {
    if (!directory) return [] as { leagueId: string; season: string }[];
    return directory.leagues
      .map((lg) => ({ leagueId: lg.league_id, season: lg.season }))
      .sort((a, b) => b.season.localeCompare(a.season));
  }, [directory]);
  const scheduleLeagueId = useMemo(() => {
    const hit = scheduleSeasons.find((s) => s.season === scheduleSeasonReq);
    return hit?.leagueId ?? directory?.currentLeagueId ?? null;
  }, [scheduleSeasons, scheduleSeasonReq, directory]);
  const schedule = useMemo(() => {
    if (!allMatchups || !scheduleLeagueId) return [];
    const season = scheduleSeasons.find((s) => s.leagueId === scheduleLeagueId)?.season ?? '';
    const games = pairGames(allMatchups.filter((m) => m.league_id === scheduleLeagueId), season);
    return games
      .filter((g) => g.a.rosterId === rosterId || g.b.rosterId === rosterId)
      // Sleeper reports unplayed weeks as 0–0; don't show them as ties.
      .filter((g) => g.a.points > 0 || g.b.points > 0)
      .map((g) => {
        const me = g.a.rosterId === rosterId ? g.a : g.b;
        const opp = g.a.rosterId === rosterId ? g.b : g.a;
        return { week: g.week, me, opp, won: me.points > opp.points, tied: me.points === opp.points };
      })
      .sort((a, b) => a.week - b.week);
  }, [allMatchups, scheduleLeagueId, scheduleSeasons, rosterId]);

  // Season-by-season record with league finish (by wins, then fpts)
  const seasons = useMemo(() => {
    if (!directory || !currentRoster?.owner_id) return [];
    return directory.leagues
      .map((league) => {
        const leagueRosters = directory.rosters.filter((r) => r.league_id === league.league_id);
        const mine = leagueRosters.find((r) => r.owner_id === currentRoster.owner_id);
        if (!mine) return null;
        const standings = [...leagueRosters].sort(
          (a, b) => (b.wins || 0) - (a.wins || 0) || Number(b.fpts || 0) - Number(a.fpts || 0)
        );
        // A season has started once any roster has a game on record; a 0-0
        // season (offseason/future) has no real finish and is hidden until then.
        const started = leagueRosters.some((r) => (r.wins || 0) + (r.losses || 0) + (r.ties || 0) > 0);
        return {
          season: league.season,
          wins: mine.wins || 0,
          losses: mine.losses || 0,
          fpts: Number(mine.fpts) || 0,
          finish: standings.findIndex((r) => r.roster_id === mine.roster_id) + 1,
          teams: leagueRosters.length,
          started,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
  }, [directory, currentRoster]);

  // Only seasons that have actually been played — drives the season history +
  // tenure count so an unstarted (offseason) season isn't shown as a result.
  const playedSeasons = useMemo(() => seasons.filter((s) => s.started), [seasons]);

  // Live "where I stand now" — current roster-value rank in the league,
  // independent of whether the season has started (updates as values move).
  const currentPower = useMemo(() => {
    if (!directory || !playerValues || !currentRoster) return null;
    const leagueRosters = directory.rosters.filter((r) => r.league_id === directory.currentLeagueId);
    const totals = leagueRosters.map((r) => ({
      rosterId: r.roster_id,
      total: ((r.players as string[]) || []).reduce((s, pid) => s + (playerValues.get(pid) || 0), 0),
    }));
    totals.sort((a, b) => b.total - a.total);
    const rank = totals.findIndex((t) => t.rosterId === currentRoster.roster_id) + 1;
    return rank > 0 ? { rank, teams: totals.length } : null;
  }, [directory, playerValues, currentRoster]);

  // Trade ledger valued at TODAY's KTC (consumed past picks value at 0)
  const ledger = useMemo((): TradeLedgerEntry[] => {
    if (!trades || !playerValues || !directory) return [];
    return trades.map((tx) => {
      const adds = playerMoves(tx.adds);
      const drops = playerMoves(tx.drops);
      const picks = txDraftPicks(tx.draft_picks);

      const playersIn = Object.keys(adds).filter((p) => adds[p] === rosterId);
      const playersOut = Object.keys(drops).filter((p) => drops[p] === rosterId);
      const picksInList = picks.filter((p) => p.owner_id === rosterId);
      const picksOutList = picks.filter((p) => p.previous_owner_id === rosterId && p.owner_id !== rosterId);

      const pickVal = (p: { season: string; round: number }) =>
        lookupPickValue(pickValues || [], p.season, p.round);

      const valueIn =
        playersIn.reduce((s, p) => s + (playerValues.get(p) || 0), 0) +
        picksInList.reduce((s, p) => s + pickVal(p), 0);
      const valueOut =
        playersOut.reduce((s, p) => s + (playerValues.get(p) || 0), 0) +
        picksOutList.reduce((s, p) => s + pickVal(p), 0);

      return {
        txId: tx.transaction_id,
        timestamp: tx.created || 0,
        season: directory.seasonByLeague.get(tx.league_id) ?? null,
        partners: (tx.roster_ids || []).filter((r) => r !== rosterId),
        playersIn,
        playersOut,
        picksIn: picksInList.map((p) => `${p.season} R${p.round}`),
        picksOut: picksOutList.map((p) => `${p.season} R${p.round}`),
        valueIn,
        valueOut,
        net: valueIn - valueOut,
      };
    });
  }, [trades, playerValues, pickValues, directory, rosterId]);

  const cumulativeTradeSeries = useMemo(() => {
    const series: { date: string; value: number }[] = [];
    let running = 0;
    for (const e of ledger) {
      if (e.timestamp <= 0) continue;
      running += e.net;
      series.push({ date: new Date(e.timestamp).toISOString().slice(0, 10), value: running });
    }
    return series;
  }, [ledger]);

  const rosterAssets = useMemo(() => {
    if (!currentRoster || !playersMap || !playerValues) return [];
    return (currentRoster.players || [])
      .map((pid) => {
        const p = playersMap.get(pid);
        return { id: pid, name: p?.full_name || pid, position: p?.position || '?', team: p?.team || null, value: playerValues.get(pid) || 0 };
      })
      .sort((a, b) => b.value - a.value);
  }, [currentRoster, playersMap, playerValues]);

  // Roster split into the actual starting lineup (by slot) vs the bench.
  const lineupGroups = useMemo(() => {
    if (!teamLineup || !playersMap || !teamLineup.slots.length) return null;
    const info = (pid: string) => {
      const p = playersMap.get(pid);
      return { id: pid, name: p?.full_name || pid, position: p?.position || '?', team: p?.team || null, value: playerValues?.get(pid) || 0 };
    };
    const startSlots = teamLineup.slots.filter((s) => !BENCH_SLOTS.has(s));
    const starters = startSlots.map((slot, i) => {
      const pid = teamLineup.starters[i];
      return { slot: SLOT_LABEL[slot] || slot, player: pid && pid !== '0' ? info(pid) : null };
    });
    const startedIds = new Set(teamLineup.starters.filter((id) => id && id !== '0'));
    const bench = teamLineup.players.filter((id) => !startedIds.has(id)).map(info).sort((a, b) => b.value - a.value);
    return { starters, bench };
  }, [teamLineup, playersMap, playerValues]);

  // ── Roster construction: weighted positional value vs the league average,
  //    so a team's strengths and holes are legible at a glance. ──────────
  const construction = useMemo(() => {
    if (!directory || !playersMap || !playerValues) return null;
    const leagueRosters = directory.rosters.filter((r) => r.league_id === directory.currentLeagueId);
    if (!leagueRosters.length) return null;

    const posValues = (playerIds: string[]): Record<RosterPosition, number> => {
      const groups: Record<RosterPosition, { value: number }[]> = { QB: [], RB: [], WR: [], TE: [] };
      for (const pid of playerIds) {
        const p = playersMap.get(pid);
        const val = playerValues.get(pid) || 0;
        if (p && (p.position as RosterPosition) in POSITION_WEIGHT_TIERS) {
          groups[p.position as RosterPosition].push({ value: val });
        }
      }
      return {
        QB: calcWeightedPositionValue(groups.QB, 'QB'),
        RB: calcWeightedPositionValue(groups.RB, 'RB'),
        WR: calcWeightedPositionValue(groups.WR, 'WR'),
        TE: calcWeightedPositionValue(groups.TE, 'TE'),
      };
    };

    const mine = posValues((currentRoster?.players as string[]) || []);
    const leagueAvg: Record<RosterPosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    for (const r of leagueRosters) {
      const pv = posValues((r.players as string[]) || []);
      for (const pos of POSITIONS) leagueAvg[pos] += pv[pos];
    }
    for (const pos of POSITIONS) leagueAvg[pos] = leagueAvg[pos] / leagueRosters.length;

    const rows = POSITIONS.map((pos) => {
      const ratio = leagueAvg[pos] > 0 ? mine[pos] / leagueAvg[pos] : 1;
      const label = ratio >= 1.2 ? 'Strong' : ratio <= 0.8 ? 'Thin' : 'Average';
      return { pos, value: mine[pos], avg: leagueAvg[pos], ratio, label };
    });
    const max = Math.max(1, ...rows.flatMap((r) => [r.value, r.avg]));
    const strongest = [...rows].sort((a, b) => b.ratio - a.ratio)[0];
    const weakest = [...rows].sort((a, b) => a.ratio - b.ratio)[0];
    return { rows, max, strongest, weakest };
  }, [directory, playersMap, playerValues, currentRoster]);

  // Bench value = tradeable depth sitting outside the starting lineup.
  const benchValue = useMemo(
    () => lineupGroups?.bench.reduce((s, p) => s + p.value, 0) ?? null,
    [lineupGroups]
  );

  // ── Draft capital: this team's future picks, valued. ─────────────────
  const draftCapital = useMemo(() => {
    if (!directory || !pickValues || !tradedPicks) return null;
    const leagueRosters = directory.rosters.filter((r) => r.league_id === directory.currentLeagueId);
    if (!leagueRosters.length) return null;
    const rosterList: Roster[] = leagueRosters.map((r) => ({
      roster_id: r.roster_id,
      owner_id: r.owner_id || '',
      players: (r.players as string[]) || [],
      wins: r.wins || 0,
      losses: r.losses || 0,
      fpts: Number(r.fpts) || 0,
      ownerName: directory.teamName(r.roster_id),
      teamName: null,
    }));
    const picks = buildPicksForRoster(rosterId, rosterList, pickValues, tradedPicks as { season: string; round: number; roster_id: number; owner_id: number }[]);
    const total = picks.reduce((s, p) => s + p.value, 0);
    return { picks, total };
  }, [directory, pickValues, tradedPicks, rosterId]);

  if (isLoading || !directory) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-4">
        <div className="skeleton h-32 w-full rounded-2xl" />
        <div className="skeleton h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!currentRoster) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto text-center py-16">
        <p className="text-sm text-muted">Team not found.</p>
        <Link to="/" className="text-xs text-accent-400 mt-2 inline-block">Back to Home</Link>
      </div>
    );
  }

  const teamName = directory.teamName(rosterId);
  const owner = directory.users.find((u) => u.user_id === currentRoster.owner_id);
  const totalValue = rosterAssets.reduce((s, a) => s + a.value, 0);
  const allTime = seasons.reduce((acc, s) => ({ w: acc.w + s.wins, l: acc.l + s.losses }), { w: 0, l: 0 });
  const tradeNet = ledger.reduce((s, e) => s + e.net, 0);
  const visibleAssets = showFullRoster ? rosterAssets : rosterAssets.slice(0, 8);

  // Resolve an opponent owner → their current team name and roster (for links).
  const ownerCurrentRoster = (oid: string) =>
    directory.rosters.find((r) => r.owner_id === oid && r.league_id === directory.currentLeagueId)
    ?? directory.rosters.find((r) => r.owner_id === oid);
  const ownerName = (oid: string) => {
    const r = ownerCurrentRoster(oid);
    return r ? directory.teamName(r.roster_id, r.league_id) : 'Unknown';
  };

  // Playstyle tags, all derived from data already on the page.
  const gmTags: string[] = [];
  if (analytics && analytics.weightedAge > 0) {
    const d = analytics.weightedAge - analytics.leagueWeightedAge;
    gmTags.push(d < -0.6 ? 'Building young' : d > 0.6 ? 'Win-now roster' : 'Balanced age');
  }
  const tradesPerSeason = playedSeasons.length ? ledger.length / playedSeasons.length : ledger.length;
  gmTags.push(tradesPerSeason >= 6 ? 'Wheeler-dealer' : tradesPerSeason >= 3 ? 'Active trader' : 'Stands pat');
  if (tradeNet > 3000) gmTags.push('Trades up in value');
  else if (tradeNet < -3000) gmTags.push('Sells the future');

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-4">
      {/* ── Header ── */}
      <section className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-[#16161c] via-[#141419] to-[#111116]">
        <div className="pointer-events-none absolute -top-20 -right-12 h-48 w-48 rounded-full bg-accent-500/10 blur-3xl" />
        <div className="relative p-4 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden bg-overlay shrink-0 ring-1 ring-inset ring-white/10 flex items-center justify-center">
              {directory.teamAvatar(rosterId) ? (
                <img src={directory.teamAvatar(rosterId)!} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
              ) : (
                <Users className="h-6 w-6 text-ghost" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-xl sm:text-3xl font-bold text-white tracking-tight truncate">{teamName}</h1>
              <p className="text-[12px] text-muted mt-1">
                {owner?.display_name || owner?.username || 'Unknown owner'} · {playedSeasons.length} season{playedSeasons.length !== 1 ? 's' : ''} played
              </p>
            </div>
            <button
              onClick={openTrade}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-accent-500 hover:bg-accent-400 active:bg-accent-600 text-white text-[12px] font-semibold px-3 h-9 shadow-[0_0_10px_rgba(34,197,94,0.2)] transition-colors"
            >
              <ArrowRightLeft className="h-4 w-4" /> Trade
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2.5 mt-4 sm:mt-5">
            <StatTile label="Roster value">{totalValue.toLocaleString()}</StatTile>
            <StatTile label="All-time">{allTime.w}-{allTime.l}</StatTile>
            <StatTile
              label="Trade net (today)"
              hint="Everything received minus everything given across all trades, priced at TODAY's community value. Shows how traded assets aged — not whether trades were fair when made."
              valueClassName={tradeNet > 0 ? 'text-accent-500' : tradeNet < 0 ? 'text-red-400' : 'text-faint'}
            >
              {tradeNet > 0 ? '+' : ''}{tradeNet.toLocaleString()}
            </StatTile>
          </div>
        </div>
      </section>

      {/* ── Tab bar (under the team card, swaps the content below) ── */}
      <TabBar tabs={TEAM_TABS} active={activeTab} onChange={(id) => set('tab', id === 'overview' ? null : id)} />

      {/* ═══ OVERVIEW: value trajectory + season history ═══ */}
      {activeTab === 'overview' && (<>
      {/* ── Roster value by season (vs league average) ── */}
      <section className="bg-surface rounded-2xl p-4 sm:p-5 border border-line">
        <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase mb-0.5">Power &amp; Finish by Season</p>
        <p className="text-[10px] text-faint mb-3">
          Where this team ranked in roster talent (green) vs where it actually finished (purple), each season.
          Rising = climbing the league; a finish worse than power means underachieving, better means overachieving.
        </p>

        {seasonLoading && !seasonRanks ? (
          <div className="skeleton h-[240px] w-full rounded-xl" />
        ) : (
        <>
        {/* Lead readout: the team's CURRENT roster-value rank (live, works in the
            offseason) + how far it has climbed across the played seasons. */}
        {currentPower && (() => {
          const ord = (n: number) => {
            const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
            return n + (s[(v - 20) % 10] || s[v] || s[0]);
          };
          const pts = seasonRanks ?? [];
          const first = pts[0];
          const moved = first ? first.powerRank - currentPower.rank : 0; // + = climbed
          return (
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 mb-3">
              <div>
                <span className="font-display text-2xl font-bold text-accent-400 tabular-nums">{ord(currentPower.rank)}</span>
                <span className="ml-2 text-[12px] text-faint">in roster talent now, of {currentPower.teams}</span>
              </div>
              {first && moved !== 0 && (
                <span className={`text-[11px] font-semibold ${moved > 0 ? 'text-accent-400' : 'text-red-400'}`}>
                  {moved > 0 ? `▲ up ${moved}` : `▼ down ${Math.abs(moved)}`} since {first.season}
                </span>
              )}
            </div>
          );
        })()}

        {(seasonRanks?.length ?? 0) > 0 ? (
          <SeasonRankChart data={seasonRanks || []} height={240} />
        ) : (
          <p className="text-[12px] text-ghost py-8 text-center">
            No completed seasons yet{nfl?.isOffseason ? ` — the ${nfl.season} season hasn't started` : ''}.
          </p>
        )}
        </>
        )}
      </section>
      </>)}

      {/* ═══ SCHEDULE: this team's weekly matchups (moved from the League page —
          a per-team schedule reads better than a league-wide scoreboard) ═══ */}
      {activeTab === 'schedule' && (
        <SectionCard
          label="Schedule"
          sub={`${scheduleSeasons.find((s) => s.leagueId === scheduleLeagueId)?.season ?? ''} season · week by week`}
          right={
            scheduleSeasons.length > 1 ? (
              <Segmented
                size="sm"
                layout="inline"
                value={scheduleLeagueId ?? ''}
                onChange={(leagueId) =>
                  set('sseason', leagueId === (directory?.currentLeagueId ?? null)
                    ? null
                    : scheduleSeasons.find((s) => s.leagueId === leagueId)?.season ?? null)
                }
                options={scheduleSeasons.map((s) => ({ value: s.leagueId, label: s.season }))}
              />
            ) : undefined
          }
          flush
        >
          {schedule.length === 0 ? (
            <p className="text-[12px] text-ghost px-4 sm:px-5 pb-5">
              No games played this season yet.
            </p>
          ) : (
            <div className="divide-y divide-[#1b1b22]">
              {schedule.map((g) => (
                <Link
                  key={g.week}
                  to={`/teams/${g.opp.rosterId}`}
                  className="flex items-center gap-3 px-4 sm:px-5 py-2.5 hover:bg-[#17171d] transition-colors group"
                >
                  <span className="w-10 shrink-0 text-[11px] font-bold text-ghost tabular-nums uppercase">Wk {g.week}</span>
                  <span
                    className={`w-5 shrink-0 text-center text-[11px] font-bold ${
                      g.tied ? 'text-faint' : g.won ? 'text-accent-400' : 'text-red-400'
                    }`}
                  >
                    {g.tied ? 'T' : g.won ? 'W' : 'L'}
                  </span>
                  <span className="w-7 h-7 rounded-full overflow-hidden bg-overlay shrink-0 ring-1 ring-inset ring-white/10 flex items-center justify-center">
                    {directory.teamAvatar(g.opp.rosterId, scheduleLeagueId ?? undefined) ? (
                      <img
                        src={directory.teamAvatar(g.opp.rosterId, scheduleLeagueId ?? undefined)!}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                      />
                    ) : (
                      <Users className="h-3.5 w-3.5 text-ghost" />
                    )}
                  </span>
                  <span className="flex-1 min-w-0 text-[13px] text-white truncate group-hover:text-accent-400 transition-colors">
                    {directory.teamName(g.opp.rosterId, scheduleLeagueId ?? undefined)}
                  </span>
                  <span className="shrink-0 font-display text-[13px] font-bold tabular-nums">
                    <span className={g.won ? 'text-white' : 'text-faint'}>{g.me.points.toFixed(1)}</span>
                    <span className="text-[#4c4c56] mx-1">–</span>
                    <span className={!g.won && !g.tied ? 'text-white' : 'text-faint'}>{g.opp.points.toFixed(1)}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-[#4c4c56] group-hover:text-accent-400 shrink-0 transition-colors" />
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* ═══ OVERVIEW (cont.): roster construction (positional strengths/holes) ═══ */}
      {activeTab === 'roster' && construction && (
        <SectionCard label="Roster Construction" sub="Weighted value by position vs the league average — the team's strengths and holes">
          <div className="space-y-3">
            {construction.rows.map((r) => {
              const strong = r.label === 'Strong';
              const thin = r.label === 'Thin';
              const color = thin ? '#f59e0b' : strong ? CHART_POS : '#3a3a44';
              const tag = thin ? 'text-amber-400' : strong ? 'text-accent-400' : 'text-faint';
              return (
                <div key={r.pos}>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-[12px] font-semibold text-white flex items-center gap-1.5">
                      {r.pos}
                      <span className={`text-[10px] font-bold uppercase tracking-wide ${tag}`}>{r.label}</span>
                    </span>
                    <span className="text-[11px] tabular-nums text-muted">
                      {fmtVal(r.value)} <span className="text-ghost">· avg {fmtVal(r.avg)}</span>
                    </span>
                  </div>
                  <div className="relative h-2.5 rounded-full bg-elevated overflow-hidden">
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(r.value / construction.max) * 100}%`, backgroundColor: color, opacity: 0.9 }} />
                    <div className="absolute inset-y-0 w-px bg-white/40" style={{ left: `${(r.avg / construction.max) * 100}%` }} title={`league avg ${fmtVal(r.avg)}`} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 text-[11px]">
            <span className="text-muted">Deepest: <span className="text-accent-400 font-semibold">{construction.strongest.pos}</span></span>
            <span className="text-muted">Thinnest: <span className="text-amber-400 font-semibold">{construction.weakest.pos}</span></span>
            {benchValue != null && (
              <span className="text-muted">Bench depth: <span className="text-white font-semibold tabular-nums">{fmtVal(benchValue)}</span></span>
            )}
            <Link to={`/trade?tab=find&team=${rosterId}`} className="ml-auto inline-flex items-center gap-1 text-accent-400 hover:text-accent-300 font-semibold">
              <Target className="h-3.5 w-3.5" /> Find trades
            </Link>
          </div>
        </SectionCard>
      )}

      {/* ═══ ROSTER (cont.): draft capital ═══ */}
      {activeTab === 'roster' && draftCapital && draftCapital.picks.length > 0 && (
        <SectionCard
          label="Draft Capital"
          sub="Future rookie picks this team controls"
          right={<span className="text-[11px] tabular-nums text-muted">{fmtVal(draftCapital.total)} <span className="text-ghost">total</span></span>}
          flush
        >
          <div>
            {draftCapital.picks.slice(0, 8).map((pk) => (
              <PlayerRow key={pk.id} playerId={null} name={pk.name} value={pk.value} to={null} divided />
            ))}
          </div>
        </SectionCard>
      )}

      {/* ═══ TRANSACTIONS: trade +/- + all moves ═══ */}
      {activeTab === 'transactions' && (<>
      {/* ── Cumulative trade +/- ── */}
      <section className="bg-surface rounded-2xl p-4 sm:p-5 border border-line">
        <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase mb-0.5">Trade Plus/Minus</p>
        <p className="text-[10px] text-faint mb-3">
          Running value gained or lost across {ledger.length} trades, priced at today's community value (consumed past picks count as 0)
        </p>
        <ValueChart data={cumulativeTradeSeries} height={200} diverging step />

        {/* Ledger — each row opens the trade's value page */}
        {ledger.length > 0 && (
          <div className="mt-4 -mx-4 sm:-mx-5 border-t border-line-subtle">
            {[...ledger].reverse().map((e) => (
              <Link
                key={e.txId}
                to={`/trades/${e.txId}`}
                className="group flex items-center gap-3 px-4 sm:px-5 py-2.5 border-b border-line-subtle last:border-b-0 hover:bg-elevated active:bg-overlay transition-colors"
              >
                <ArrowRightLeft className="h-3.5 w-3.5 text-ghost shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-white truncate">
                    <span className="text-faint">with</span>{' '}
                    {e.partners.map((p, i) => (
                      <span key={p} className="font-medium group-hover:text-accent-400 transition-colors">
                        {i > 0 && ', '}{directory.teamName(p)}
                      </span>
                    ))}
                  </p>
                  <p className="text-[10px] text-faint truncate">
                    Got {[...e.playersIn.map((p) => playersMap?.get(p)?.full_name || p), ...e.picksIn].join(', ') || 'nothing'}
                    <span className="text-[#4c4c56]"> · gave </span>
                    {[...e.playersOut.map((p) => playersMap?.get(p)?.full_name || p), ...e.picksOut].join(', ') || 'nothing'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-display text-[13px] font-bold tabular-nums" style={{ color: e.net > 0 ? CHART_POS : e.net < 0 ? CHART_NEG : '#75757f' }}>
                    {e.net > 0 ? '+' : ''}{e.net.toLocaleString()}
                  </p>
                  <p className="text-[9px] text-ghost tabular-nums">
                    {e.timestamp ? new Date(e.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : e.season}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-[#4c4c56] group-hover:text-accent-400 shrink-0 transition-colors" />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── Waivers / free-agent moves ── */}
      <section className="bg-surface rounded-2xl p-4 sm:p-5 border border-line">
        <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase mb-0.5">Waivers &amp; Free Agents</p>
        <p className="text-[10px] text-faint mb-3">Non-trade adds and drops, newest first</p>
        {(moves?.length ?? 0) === 0 ? (
          <p className="text-[12px] text-ghost py-4 text-center">No waiver or free-agent moves.</p>
        ) : (
          <div className="-mx-4 sm:-mx-5 border-t border-line-subtle">
            {(moves || []).map((tx) => {
              const adds = Object.keys(playerMoves(tx.adds)).filter((p) => playerMoves(tx.adds)[p] === rosterId);
              const drops = Object.keys(playerMoves(tx.drops)).filter((p) => playerMoves(tx.drops)[p] === rosterId);
              const label = tx.type === 'free_agent' ? 'FA' : tx.type === 'waiver' ? 'Waiver' : tx.type;
              return (
                <div key={tx.transaction_id} className="flex items-center gap-3 px-4 sm:px-5 py-2.5 border-b border-line-subtle last:border-b-0">
                  <span className="text-[9px] font-bold tracking-[1px] uppercase text-muted bg-elevated rounded px-1.5 py-0.5 shrink-0">{label}</span>
                  <div className="min-w-0 flex-1 text-[12px]">
                    {adds.length > 0 && (
                      <p className="truncate"><span className="text-accent-400 font-bold">+ </span>
                        <span className="text-white">{adds.map((p) => playersMap?.get(p)?.full_name || p).join(', ')}</span></p>
                    )}
                    {drops.length > 0 && (
                      <p className="truncate"><span className="text-red-400 font-bold">− </span>
                        <span className="text-muted">{drops.map((p) => playersMap?.get(p)?.full_name || p).join(', ')}</span></p>
                    )}
                  </div>
                  <span className="text-[9px] text-ghost tabular-nums shrink-0">
                    {tx.created ? new Date(tx.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
      </>)}

      {/* ═══ OVERVIEW (cont.): season history ═══ */}
      {activeTab === 'overview' && (
      <section className="bg-surface rounded-2xl p-4 sm:p-5 border border-line">
        <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase mb-3">Season History</p>
        {playedSeasons.length === 0 ? (
          <p className="text-[12px] text-ghost py-6 text-center">
            No completed seasons yet{nfl?.isOffseason ? ` — the ${nfl.season} season hasn't started` : ''}.
          </p>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] text-faint uppercase tracking-wider">
                <th className="py-1.5 font-bold">Season</th>
                <th className="py-1.5 font-bold">Record</th>
                <th className="py-1.5 font-bold text-right">Points</th>
                <th className="py-1.5 font-bold text-right">Finish</th>
              </tr>
            </thead>
            <tbody>
              {playedSeasons.map((s) => (
                <tr key={s.season} className="border-t border-line-subtle text-[12px]">
                  <td className="py-2 text-white font-semibold">{s.season}</td>
                  <td className="py-2 text-muted tabular-nums">{s.wins}-{s.losses}</td>
                  <td className="py-2 text-muted text-right tabular-nums">{s.fpts.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="py-2 text-white text-right tabular-nums font-medium">{s.finish} / {s.teams}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </section>
      )}

      {/* ═══ OVERVIEW (cont.): GM profile + head-to-head rivalries ═══ */}
      {activeTab === 'overview' && (h2h && h2h.length > 0) && (
      <section className="bg-surface rounded-2xl p-4 sm:p-5 border border-line">
        <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase mb-0.5">Head-to-Head</p>
        <p className="text-[10px] text-faint mb-3">All-time record vs each manager across every season of the dynasty</p>

        {gmTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {gmTags.map((t) => (
              <span key={t} className="inline-flex items-center rounded-full bg-elevated border border-[#2e2e38] px-2 py-0.5 text-[10px] font-semibold text-[#c4c4cc]">
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="-mx-4 sm:-mx-5 border-t border-line-subtle">
          {h2h.map((r) => {
            const oppRoster = ownerCurrentRoster(r.opponentOwnerId);
            const winPct = r.games ? r.wins / r.games : 0;
            const avgMargin = r.games ? (r.pointsFor - r.pointsAgainst) / r.games : 0;
            const rowInner = (
              <>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-white font-medium truncate group-hover:text-accent-400 transition-colors">
                    {ownerName(r.opponentOwnerId)}
                  </p>
                  <p className="text-[10px] text-faint tabular-nums">
                    {r.games} game{r.games !== 1 ? 's' : ''} · {avgMargin >= 0 ? '+' : ''}{avgMargin.toFixed(1)} avg margin
                  </p>
                </div>
                {/* Win-pct mini bar */}
                <div className="w-16 h-1.5 rounded-full bg-overlay overflow-hidden shrink-0">
                  <div className="h-full rounded-full" style={{ width: `${winPct * 100}%`, backgroundColor: winPct >= 0.5 ? CHART_POS : CHART_NEG, opacity: 0.85 }} />
                </div>
                <div className="text-right shrink-0 w-14">
                  <p className="font-display text-[13px] font-bold tabular-nums" style={{ color: r.wins > r.losses ? CHART_POS : r.wins < r.losses ? CHART_NEG : '#9c9ca7' }}>
                    {r.wins}-{r.losses}{r.ties ? `-${r.ties}` : ''}
                  </p>
                </div>
              </>
            );
            const cls = 'group flex items-center gap-3 px-4 sm:px-5 py-2.5 border-b border-line-subtle last:border-b-0';
            return oppRoster ? (
              <Link key={r.opponentOwnerId} to={`/teams/${oppRoster.roster_id}`} className={`${cls} hover:bg-elevated active:bg-overlay transition-colors`}>
                {rowInner}
              </Link>
            ) : (
              <div key={r.opponentOwnerId} className={cls}>{rowInner}</div>
            );
          })}
        </div>
      </section>
      )}

      {/* ═══ ANALYTICS: contention window, scoring/luck, positional edge ═══ */}
      {activeTab === 'analytics' && (
        analyticsLoading && !analytics ? (
          <div className="space-y-4">
            <div className="skeleton h-56 w-full rounded-2xl" />
            <div className="skeleton h-56 w-full rounded-2xl" />
          </div>
        ) : analytics ? (
          <TeamAnalyticsCharts data={analytics} lineup={lineup} />
        ) : null
      )}

      {/* ═══ ROSTER: starting lineup (by slot) + bench ═══ */}
      {activeTab === 'roster' && (
        lineupGroups ? (
          <div className="space-y-4">
            {/* Starting lineup */}
            <section className="bg-surface rounded-2xl border border-line overflow-hidden">
              <div className="px-4 sm:px-5 pt-4 pb-2 flex items-baseline justify-between">
                <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase">Starting Lineup</p>
                <span className="text-[10px] text-ghost">{lineupGroups.starters.length} slots</span>
              </div>
              {lineupGroups.starters.map((s, i) => {
                const chip = (
                  <span className="font-display text-[10px] font-bold w-9 text-center text-faint uppercase tracking-wide shrink-0">
                    {s.slot}
                  </span>
                );
                return s.player ? (
                  <PlayerRow
                    key={`${s.slot}-${i}`}
                    playerId={s.player.id}
                    name={s.player.name}
                    position={s.player.position}
                    team={s.player.team}
                    value={s.player.value}
                    lead={chip}
                    divided
                  />
                ) : (
                  <div key={`${s.slot}-${i}`} className="flex items-center gap-3 px-3 py-2.5 border-b border-line-subtle last:border-b-0">
                    {chip}
                    <div className="w-9 h-9 rounded-full bg-[#161616] border border-line shrink-0" />
                    <span className="text-[13px] text-[#4c4c56] italic">Empty</span>
                  </div>
                );
              })}
            </section>

            {/* Bench */}
            <section className="bg-surface rounded-2xl border border-line overflow-hidden">
              <div className="px-4 sm:px-5 pt-4 pb-2 flex items-baseline justify-between">
                <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase">Bench</p>
                <span className="text-[10px] text-ghost">{lineupGroups.bench.length} players</span>
              </div>
              {(showFullRoster ? lineupGroups.bench : lineupGroups.bench.slice(0, 8)).map((a) => (
                <PlayerRow key={a.id} playerId={a.id} name={a.name} position={a.position} team={a.team} value={a.value} divided />
              ))}
              {lineupGroups.bench.length > 8 && (
                <button
                  onClick={() => setShowFullRoster((v) => !v)}
                  className="w-full py-2.5 text-[11px] text-faint hover:text-white active:text-white transition-colors border-t border-line-subtle"
                >
                  {showFullRoster ? 'Show less' : `Show all ${lineupGroups.bench.length} bench players`}
                </button>
              )}
            </section>
          </div>
        ) : (
          <section className="bg-surface rounded-2xl border border-line overflow-hidden">
            <div className="px-4 sm:px-5 pt-4 pb-2 flex items-baseline justify-between">
              <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase">Roster</p>
              <span className="text-[10px] text-ghost">{rosterAssets.length} players</span>
            </div>
            {visibleAssets.map((a) => (
              <PlayerRow key={a.id} playerId={a.id} name={a.name} position={a.position} team={a.team} value={a.value} divided />
            ))}
            {rosterAssets.length > 8 && (
              <button
                onClick={() => setShowFullRoster((v) => !v)}
                className="w-full py-2.5 text-[11px] text-faint hover:text-white active:text-white transition-colors border-t border-line-subtle"
              >
                {showFullRoster ? 'Show less' : `Show all ${rosterAssets.length} players`}
              </button>
            )}
          </section>
        )
      )}
    </div>
  );
}
