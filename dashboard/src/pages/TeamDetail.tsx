import { useParams, Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { ArrowRightLeft, ChevronRight, Users } from 'lucide-react';
import { ValueChart } from '../components/charts/ValueChart';
import { CHART_POS, CHART_NEG } from '../components/charts/theme';
import { PlayerRow } from '../components/PlayerRow';
import { useLeagueDirectory, useRosterValueHistory, useTeamTrades } from '../hooks/detail';
import { usePlayerMap } from '../hooks/useLeagueData';
import { usePlayerValuesList, usePickValues } from '../hooks/queries';
import { playerMoves, txDraftPicks, lookupPickValue } from '../lib/trade-shared';

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
  const [showFullRoster, setShowFullRoster] = useState(false);

  const currentRoster = useMemo(() => {
    if (!directory) return null;
    return directory.rosters.find(
      (r) => r.roster_id === rosterId && r.league_id === directory.currentLeagueId
    ) ?? null;
  }, [directory, rosterId]);

  const { data: rosterHistory } = useRosterValueHistory(currentRoster?.players || undefined);

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

  const stat = (label: string, node: React.ReactNode) => (
    <div className="rounded-xl border border-[#22222b] bg-[#101015]/60 px-3 py-2.5">
      <p className="text-[10px] text-[#75757f] uppercase tracking-[0.12em] font-bold">{label}</p>
      <p className="font-display text-lg font-bold text-white tabular-nums mt-0.5">{node}</p>
    </div>
  );

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
            {stat('Roster value', totalValue.toLocaleString())}
            {stat('All-time', `${allTime.w}-${allTime.l}`)}
            {stat('Trades', ledger.length)}
            <div className="rounded-xl border border-[#22222b] bg-[#101015]/60 px-3 py-2.5">
              <p className="text-[10px] text-[#75757f] uppercase tracking-[0.12em] font-bold">Trade net</p>
              <p className={`font-display text-lg font-bold tabular-nums mt-0.5 ${tradeNet > 0 ? 'text-accent-500' : tradeNet < 0 ? 'text-red-400' : 'text-[#75757f]'}`}>
                {tradeNet > 0 ? '+' : ''}{tradeNet.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Roster value over time ── */}
      <section className="bg-[#141419] rounded-2xl p-4 sm:p-5 border border-[#22222b]">
        <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase mb-0.5">Roster Value Over Time</p>
        <p className="text-[10px] text-[#75757f] mb-3">Combined KTC value of the current roster, tracked back through time</p>
        <ValueChart data={rosterHistory || []} height={240} />
      </section>

      {/* ── Cumulative trade +/- ── */}
      <section className="bg-[#141419] rounded-2xl p-4 sm:p-5 border border-[#22222b]">
        <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase mb-0.5">Trade Plus/Minus</p>
        <p className="text-[10px] text-[#75757f] mb-3">
          Running value gained or lost across {ledger.length} trades, priced at today's KTC (consumed past picks count as 0)
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

      {/* ── Season history ── */}
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

      {/* ── Current roster ── */}
      <section className="bg-[#141419] rounded-2xl border border-[#22222b] overflow-hidden">
        <div className="px-4 sm:px-5 pt-4 pb-2">
          <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase">Roster</p>
        </div>
        {visibleAssets.map((a) => (
          <PlayerRow
            key={a.id}
            playerId={a.id}
            name={a.name}
            position={a.position}
            team={a.team}
            value={a.value}
            divided
          />
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
    </div>
  );
}
