import { useParams, Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { ArrowRightLeft, ChevronRight, Users, LayoutGrid, ListChecks, BarChart3, Sparkles } from 'lucide-react';
import { ValueChart } from '../components/charts/ValueChart';
import { SeasonRankChart } from '../components/charts/SeasonRankChart';
import { TeamAnalyticsCharts } from '../components/charts/TeamAnalytics';
import { CHART_POS, CHART_NEG } from '../components/charts/theme';
import { PlayerRow } from '../components/PlayerRow';
import { StatTile } from '../components/StatTile';
import { useLeagueDirectory, useSeasonRanks, useTeamAnalytics, useTeamTrades, useTeamMoves, useLineupEfficiency, useHeadToHead, useTeamLineup } from '../hooks/detail';
import { usePlayerMap } from '../hooks/useLeagueData';
import { usePlayerValuesList, usePickValues } from '../hooks/queries';
import { useUrlState } from '../hooks/useUrlState';
import { playerMoves, txDraftPicks, lookupPickValue } from '../lib/trade-shared';

type TeamTab = 'overview' | 'analytics' | 'roster' | 'transactions';
const TEAM_TABS: { id: TeamTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'analytics', label: 'Analytics', icon: Sparkles },
  { id: 'roster', label: 'Roster', icon: LayoutGrid },
  { id: 'transactions', label: 'Transactions', icon: ListChecks },
];

// Readable lineup-slot labels + which slots don't count as starting.
const SLOT_LABEL: Record<string, string> = {
  QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K', DEF: 'DEF',
  FLEX: 'FLEX', WRRB_FLEX: 'W/R', REC_FLEX: 'W/T', SUPER_FLEX: 'SFLX',
  DL: 'DL', LB: 'LB', DB: 'DB', IDP_FLEX: 'IDP',
};
const BENCH_SLOTS = new Set(['BN', 'TAXI', 'IR']);

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
  const { data: trades } = useTeamTrades(Number.isFinite(rosterId) ? rosterId : undefined);
  const { data: moves } = useTeamMoves(Number.isFinite(rosterId) ? rosterId : undefined);
  const [showFullRoster, setShowFullRoster] = useState(false);

  const { get, set } = useUrlState();
  const activeTab = (TEAM_TABS.some((t) => t.id === get('tab')) ? get('tab') : 'overview') as TeamTab;

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
        return {
          season: league.season,
          wins: mine.wins || 0,
          losses: mine.losses || 0,
          fpts: Number(mine.fpts) || 0,
          finish: standings.findIndex((r) => r.roster_id === mine.roster_id) + 1,
          teams: leagueRosters.length,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
  }, [directory, currentRoster]);

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
        <p className="text-sm text-[#9c9ca7]">Team not found.</p>
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
  const tradesPerSeason = seasons.length ? ledger.length / seasons.length : ledger.length;
  gmTags.push(tradesPerSeason >= 6 ? 'Wheeler-dealer' : tradesPerSeason >= 3 ? 'Active trader' : 'Stands pat');
  if (tradeNet > 3000) gmTags.push('Trades up in value');
  else if (tradeNet < -3000) gmTags.push('Sells the future');

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-4">
      {/* ── Header ── */}
      <section className="relative overflow-hidden rounded-2xl border border-[#22222b] bg-gradient-to-br from-[#16161c] via-[#141419] to-[#111116]">
        <div className="pointer-events-none absolute -top-20 -right-12 h-48 w-48 rounded-full bg-accent-500/10 blur-3xl" />
        <div className="relative p-4 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/10 flex items-center justify-center">
              {directory.teamAvatar(rosterId) ? (
                <img src={directory.teamAvatar(rosterId)!} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
              ) : (
                <Users className="h-6 w-6 text-[#60606a]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-xl sm:text-3xl font-bold text-white tracking-tight truncate">{teamName}</h1>
              <p className="text-[12px] text-[#9c9ca7] mt-1">
                {owner?.display_name || owner?.username || 'Unknown owner'} · {seasons.length} season{seasons.length !== 1 ? 's' : ''} in league
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 sm:mt-5">
            <StatTile label="Roster value">{totalValue.toLocaleString()}</StatTile>
            <StatTile label="All-time">{allTime.w}-{allTime.l}</StatTile>
            <StatTile label="Trades">{ledger.length}</StatTile>
            <StatTile
              label="Trade net (today)"
              hint="Everything received minus everything given across all trades, priced at TODAY's community value. Shows how traded assets aged — not whether trades were fair when made."
              valueClassName={tradeNet > 0 ? 'text-accent-500' : tradeNet < 0 ? 'text-red-400' : 'text-[#75757f]'}
            >
              {tradeNet > 0 ? '+' : ''}{tradeNet.toLocaleString()}
            </StatTile>
          </div>
        </div>
      </section>

      {/* ── Tab bar (under the team card, swaps the content below) ── */}
      <div className="flex gap-1 bg-[#141419] border border-[#22222b] rounded-xl p-1">
        {TEAM_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => set('tab', id === 'overview' ? null : id)}
            className={`flex-1 flex items-center justify-center gap-1 sm:gap-1.5 h-9 rounded-lg text-[11px] sm:text-[13px] font-medium transition-all ${
              activeTab === id
                ? 'bg-accent-500 text-white shadow-[0_0_10px_rgba(34,197,94,0.2)]'
                : 'text-[#9c9ca7] hover:text-white hover:bg-[#1b1b22]'
            }`}
          >
            <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {/* ═══ OVERVIEW: value trajectory + season history ═══ */}
      {activeTab === 'overview' && (<>
      {/* ── Roster value by season (vs league average) ── */}
      <section className="bg-[#141419] rounded-2xl p-4 sm:p-5 border border-[#22222b]">
        <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase mb-0.5">Power &amp; Finish by Season</p>
        <p className="text-[10px] text-[#75757f] mb-3">
          Where this team ranked in roster talent (green) vs where it actually finished (purple), each season.
          Rising = climbing the league; a finish worse than power means underachieving, better means overachieving.
        </p>

        {seasonLoading && !seasonRanks ? (
          <div className="skeleton h-[240px] w-full rounded-xl" />
        ) : (
        <>
        {/* Lead readout: current power rank + trajectory since first season */}
        {(seasonRanks?.length ?? 0) > 0 && (() => {
          const pts = seasonRanks!;
          const first = pts[0];
          const latest = pts[pts.length - 1];
          const ord = (n: number) => {
            const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
            return n + (s[(v - 20) % 10] || s[v] || s[0]);
          };
          const moved = first.powerRank - latest.powerRank; // + = climbed (lower rank number)
          return (
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 mb-3">
              <div>
                <span className="font-display text-2xl font-bold text-accent-400 tabular-nums">{ord(latest.powerRank)}</span>
                <span className="ml-2 text-[12px] text-[#75757f]">in roster talent, of {latest.teams}</span>
              </div>
              {pts.length > 1 && (
                <span className={`text-[11px] font-semibold ${moved > 0 ? 'text-accent-400' : moved < 0 ? 'text-red-400' : 'text-[#60606a]'}`}>
                  {moved > 0 ? `▲ up ${moved}` : moved < 0 ? `▼ down ${Math.abs(moved)}` : '— flat'} since {first.season}
                </span>
              )}
            </div>
          );
        })()}

        <SeasonRankChart data={seasonRanks || []} height={240} />
        </>
        )}
      </section>
      </>)}

      {/* ═══ TRANSACTIONS: trade +/- + all moves ═══ */}
      {activeTab === 'transactions' && (<>
      {/* ── Cumulative trade +/- ── */}
      <section className="bg-[#141419] rounded-2xl p-4 sm:p-5 border border-[#22222b]">
        <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase mb-0.5">Trade Plus/Minus</p>
        <p className="text-[10px] text-[#75757f] mb-3">
          Running value gained or lost across {ledger.length} trades, priced at today's community value (consumed past picks count as 0)
        </p>
        <ValueChart data={cumulativeTradeSeries} height={200} diverging step />

        {/* Ledger — each row opens the trade's value page */}
        {ledger.length > 0 && (
          <div className="mt-4 -mx-4 sm:-mx-5 border-t border-[#1b1b22]">
            {[...ledger].reverse().map((e) => (
              <Link
                key={e.txId}
                to={`/trades/${e.txId}`}
                className="group flex items-center gap-3 px-4 sm:px-5 py-2.5 border-b border-[#1b1b22] last:border-b-0 hover:bg-[#1b1b22] active:bg-[#22222b] transition-colors"
              >
                <ArrowRightLeft className="h-3.5 w-3.5 text-[#60606a] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-white truncate">
                    <span className="text-[#75757f]">with</span>{' '}
                    {e.partners.map((p, i) => (
                      <span key={p} className="font-medium group-hover:text-accent-400 transition-colors">
                        {i > 0 && ', '}{directory.teamName(p)}
                      </span>
                    ))}
                  </p>
                  <p className="text-[10px] text-[#75757f] truncate">
                    Got {[...e.playersIn.map((p) => playersMap?.get(p)?.full_name || p), ...e.picksIn].join(', ') || 'nothing'}
                    <span className="text-[#4c4c56]"> · gave </span>
                    {[...e.playersOut.map((p) => playersMap?.get(p)?.full_name || p), ...e.picksOut].join(', ') || 'nothing'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-display text-[13px] font-bold tabular-nums" style={{ color: e.net > 0 ? CHART_POS : e.net < 0 ? CHART_NEG : '#75757f' }}>
                    {e.net > 0 ? '+' : ''}{e.net.toLocaleString()}
                  </p>
                  <p className="text-[9px] text-[#60606a] tabular-nums">
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
      <section className="bg-[#141419] rounded-2xl p-4 sm:p-5 border border-[#22222b]">
        <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase mb-0.5">Waivers &amp; Free Agents</p>
        <p className="text-[10px] text-[#75757f] mb-3">Non-trade adds and drops, newest first</p>
        {(moves?.length ?? 0) === 0 ? (
          <p className="text-[12px] text-[#60606a] py-4 text-center">No waiver or free-agent moves.</p>
        ) : (
          <div className="-mx-4 sm:-mx-5 border-t border-[#1b1b22]">
            {(moves || []).map((tx) => {
              const adds = Object.keys(playerMoves(tx.adds)).filter((p) => playerMoves(tx.adds)[p] === rosterId);
              const drops = Object.keys(playerMoves(tx.drops)).filter((p) => playerMoves(tx.drops)[p] === rosterId);
              const label = tx.type === 'free_agent' ? 'FA' : tx.type === 'waiver' ? 'Waiver' : tx.type;
              return (
                <div key={tx.transaction_id} className="flex items-center gap-3 px-4 sm:px-5 py-2.5 border-b border-[#1b1b22] last:border-b-0">
                  <span className="text-[9px] font-bold tracking-[1px] uppercase text-[#9c9ca7] bg-[#1b1b22] rounded px-1.5 py-0.5 shrink-0">{label}</span>
                  <div className="min-w-0 flex-1 text-[12px]">
                    {adds.length > 0 && (
                      <p className="truncate"><span className="text-accent-400 font-bold">+ </span>
                        <span className="text-white">{adds.map((p) => playersMap?.get(p)?.full_name || p).join(', ')}</span></p>
                    )}
                    {drops.length > 0 && (
                      <p className="truncate"><span className="text-red-400 font-bold">− </span>
                        <span className="text-[#9c9ca7]">{drops.map((p) => playersMap?.get(p)?.full_name || p).join(', ')}</span></p>
                    )}
                  </div>
                  <span className="text-[9px] text-[#60606a] tabular-nums shrink-0">
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
      <section className="bg-[#141419] rounded-2xl p-4 sm:p-5 border border-[#22222b]">
        <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase mb-3">Season History</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] text-[#75757f] uppercase tracking-wider">
                <th className="py-1.5 font-bold">Season</th>
                <th className="py-1.5 font-bold">Record</th>
                <th className="py-1.5 font-bold text-right">Points</th>
                <th className="py-1.5 font-bold text-right">Finish</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((s) => (
                <tr key={s.season} className="border-t border-[#1b1b22] text-[12px]">
                  <td className="py-2 text-white font-semibold">{s.season}</td>
                  <td className="py-2 text-[#9c9ca7] tabular-nums">{s.wins}-{s.losses}</td>
                  <td className="py-2 text-[#9c9ca7] text-right tabular-nums">{s.fpts.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="py-2 text-white text-right tabular-nums font-medium">{s.finish} / {s.teams}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {/* ═══ OVERVIEW (cont.): GM profile + head-to-head rivalries ═══ */}
      {activeTab === 'overview' && (h2h && h2h.length > 0) && (
      <section className="bg-[#141419] rounded-2xl p-4 sm:p-5 border border-[#22222b]">
        <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase mb-0.5">Head-to-Head</p>
        <p className="text-[10px] text-[#75757f] mb-3">All-time record vs each manager across every season of the dynasty</p>

        {gmTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {gmTags.map((t) => (
              <span key={t} className="inline-flex items-center rounded-full bg-[#1b1b22] border border-[#2e2e38] px-2 py-0.5 text-[10px] font-semibold text-[#c4c4cc]">
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="-mx-4 sm:-mx-5 border-t border-[#1b1b22]">
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
                  <p className="text-[10px] text-[#75757f] tabular-nums">
                    {r.games} game{r.games !== 1 ? 's' : ''} · {avgMargin >= 0 ? '+' : ''}{avgMargin.toFixed(1)} avg margin
                  </p>
                </div>
                {/* Win-pct mini bar */}
                <div className="w-16 h-1.5 rounded-full bg-[#22222b] overflow-hidden shrink-0">
                  <div className="h-full rounded-full" style={{ width: `${winPct * 100}%`, backgroundColor: winPct >= 0.5 ? CHART_POS : CHART_NEG, opacity: 0.85 }} />
                </div>
                <div className="text-right shrink-0 w-14">
                  <p className="font-display text-[13px] font-bold tabular-nums" style={{ color: r.wins > r.losses ? CHART_POS : r.wins < r.losses ? CHART_NEG : '#9c9ca7' }}>
                    {r.wins}-{r.losses}{r.ties ? `-${r.ties}` : ''}
                  </p>
                </div>
              </>
            );
            const cls = 'group flex items-center gap-3 px-4 sm:px-5 py-2.5 border-b border-[#1b1b22] last:border-b-0';
            return oppRoster ? (
              <Link key={r.opponentOwnerId} to={`/teams/${oppRoster.roster_id}`} className={`${cls} hover:bg-[#1b1b22] active:bg-[#22222b] transition-colors`}>
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
            <section className="bg-[#141419] rounded-2xl border border-[#22222b] overflow-hidden">
              <div className="px-4 sm:px-5 pt-4 pb-2 flex items-baseline justify-between">
                <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase">Starting Lineup</p>
                <span className="text-[10px] text-[#60606a]">{lineupGroups.starters.length} slots</span>
              </div>
              {lineupGroups.starters.map((s, i) => {
                const chip = (
                  <span className="font-display text-[10px] font-bold w-9 text-center text-[#75757f] uppercase tracking-wide shrink-0">
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
                  <div key={`${s.slot}-${i}`} className="flex items-center gap-3 px-3 py-2.5 border-b border-[#1b1b22] last:border-b-0">
                    {chip}
                    <div className="w-9 h-9 rounded-full bg-[#161616] border border-[#22222b] shrink-0" />
                    <span className="text-[13px] text-[#4c4c56] italic">Empty</span>
                  </div>
                );
              })}
            </section>

            {/* Bench */}
            <section className="bg-[#141419] rounded-2xl border border-[#22222b] overflow-hidden">
              <div className="px-4 sm:px-5 pt-4 pb-2 flex items-baseline justify-between">
                <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase">Bench</p>
                <span className="text-[10px] text-[#60606a]">{lineupGroups.bench.length} players</span>
              </div>
              {(showFullRoster ? lineupGroups.bench : lineupGroups.bench.slice(0, 8)).map((a) => (
                <PlayerRow key={a.id} playerId={a.id} name={a.name} position={a.position} team={a.team} value={a.value} divided />
              ))}
              {lineupGroups.bench.length > 8 && (
                <button
                  onClick={() => setShowFullRoster((v) => !v)}
                  className="w-full py-2.5 text-[11px] text-[#75757f] hover:text-white active:text-white transition-colors border-t border-[#1b1b22]"
                >
                  {showFullRoster ? 'Show less' : `Show all ${lineupGroups.bench.length} bench players`}
                </button>
              )}
            </section>
          </div>
        ) : (
          <section className="bg-[#141419] rounded-2xl border border-[#22222b] overflow-hidden">
            <div className="px-4 sm:px-5 pt-4 pb-2 flex items-baseline justify-between">
              <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase">Roster</p>
              <span className="text-[10px] text-[#60606a]">{rosterAssets.length} players</span>
            </div>
            {visibleAssets.map((a) => (
              <PlayerRow key={a.id} playerId={a.id} name={a.name} position={a.position} team={a.team} value={a.value} divided />
            ))}
            {rosterAssets.length > 8 && (
              <button
                onClick={() => setShowFullRoster((v) => !v)}
                className="w-full py-2.5 text-[11px] text-[#75757f] hover:text-white active:text-white transition-colors border-t border-[#1b1b22]"
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
