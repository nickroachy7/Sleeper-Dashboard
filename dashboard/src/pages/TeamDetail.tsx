import { useParams, Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRightLeft } from 'lucide-react';
import { ValueChart } from '../components/charts/ValueChart';
import { CHART_POS, CHART_NEG } from '../components/charts/theme';
import { AssetRow } from '../components/AssetRow';
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
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-4 mt-8">
        <div className="skeleton h-24 w-full rounded-xl" />
        <div className="skeleton h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!currentRoster) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto text-center py-16">
        <p className="text-sm text-[#666666]">Team not found.</p>
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

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-1.5 text-[11px] text-[#555555] hover:text-white transition-colors mb-4">
        <ArrowLeft className="h-3 w-3" /> Home
      </Link>

      {/* ── Header ── */}
      <div className="bg-[#0a0a0a] rounded-xl p-4 sm:p-5 mb-4">
        <div className="flex items-center gap-4">
          {owner?.avatar ? (
            <img src={`https://sleepercdn.com/avatars/thumbs/${owner.avatar}`} alt="" className="w-14 h-14 rounded-full bg-[#161616] shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-[#161616] shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight truncate">{teamName}</h1>
            <p className="text-[11px] text-[#666666] mt-0.5">
              {owner?.display_name || owner?.username || 'Unknown owner'} · {seasons.length} season{seasons.length !== 1 ? 's' : ''} in league
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="bg-[#111111] rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-[#555555] uppercase tracking-wider">Roster value</p>
            <p className="text-lg font-semibold text-white">{totalValue.toLocaleString()}</p>
          </div>
          <div className="bg-[#111111] rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-[#555555] uppercase tracking-wider">All-time</p>
            <p className="text-lg font-semibold text-white">{allTime.w}-{allTime.l}</p>
          </div>
          <div className="bg-[#111111] rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-[#555555] uppercase tracking-wider">Trades</p>
            <p className="text-lg font-semibold text-white">{ledger.length}</p>
          </div>
          <div className="bg-[#111111] rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-[#555555] uppercase tracking-wider">Trade net</p>
            <p className={`text-lg font-semibold ${tradeNet > 0 ? 'text-emerald-400' : tradeNet < 0 ? 'text-red-400' : 'text-[#888888]'}`}>
              {tradeNet > 0 ? '+' : ''}{tradeNet.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* ── Roster value over time ── */}
      <div className="bg-[#0a0a0a] rounded-xl p-4 sm:p-5 mb-4">
        <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-1">Roster value over time</h2>
        <p className="text-[10px] text-[#555555] mb-3">Combined KTC value of the current roster, tracked back through time</p>
        <ValueChart data={rosterHistory || []} height={240} />
      </div>

      {/* ── Cumulative trade +/- ── */}
      <div className="bg-[#0a0a0a] rounded-xl p-4 sm:p-5 mb-4">
        <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-1">Trade plus/minus</h2>
        <p className="text-[10px] text-[#555555] mb-3">
          Running value gained or lost across {ledger.length} trades, priced at today's KTC values (consumed past picks count as 0)
        </p>
        <ValueChart data={cumulativeTradeSeries} height={200} diverging step />

        {/* Ledger */}
        {ledger.length > 0 && (
          <div className="mt-4 border-t border-[#111111]">
            {[...ledger].reverse().map((e) => (
              <div key={e.txId} className="flex items-center gap-3 py-2.5 border-b border-[#111111] last:border-b-0">
                <ArrowRightLeft className="h-3.5 w-3.5 text-[#444444] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-white truncate">
                    <span className="text-[#888888]">with</span>{' '}
                    {e.partners.map((p, i) => (
                      <span key={p}>
                        {i > 0 && ', '}
                        <Link to={`/teams/${p}`} className="hover:text-accent-400 font-medium">{directory.teamName(p)}</Link>
                      </span>
                    ))}
                  </p>
                  <p className="text-[10px] text-[#666666] truncate">
                    Got {[
                      ...e.playersIn.map((p) => playersMap?.get(p)?.full_name || p),
                      ...e.picksIn,
                    ].join(', ') || 'nothing'}
                    <span className="text-[#444444]"> · gave </span>
                    {[
                      ...e.playersOut.map((p) => playersMap?.get(p)?.full_name || p),
                      ...e.picksOut,
                    ].join(', ') || 'nothing'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[12px] font-semibold tabular-nums" style={{ color: e.net > 0 ? CHART_POS : e.net < 0 ? CHART_NEG : '#888888' }}>
                    {e.net > 0 ? '+' : ''}{e.net.toLocaleString()}
                  </p>
                  <p className="text-[9px] text-[#555555] tabular-nums">
                    {e.timestamp ? new Date(e.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : e.season}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Season history ── */}
      <div className="bg-[#0a0a0a] rounded-xl p-4 sm:p-5 mb-4">
        <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Season history</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] text-[#555555] uppercase tracking-wider">
                <th className="py-1.5 font-medium">Season</th>
                <th className="py-1.5 font-medium">Record</th>
                <th className="py-1.5 font-medium text-right">Points</th>
                <th className="py-1.5 font-medium text-right">Finish</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((s) => (
                <tr key={s.season} className="border-t border-[#111111] text-[12px]">
                  <td className="py-2 text-white font-medium">{s.season}</td>
                  <td className="py-2 text-[#888888] tabular-nums">{s.wins}-{s.losses}</td>
                  <td className="py-2 text-[#888888] text-right tabular-nums">{s.fpts.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="py-2 text-white text-right tabular-nums">{s.finish} / {s.teams}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Current roster ── */}
      <div className="bg-[#0a0a0a] rounded-xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-[#111111]">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider">Roster</h2>
        </div>
        {visibleAssets.map((a) => (
          <Link key={a.id} to={`/players/${a.id}`} className="block hover:bg-[#0f0f0f] transition-colors">
            <AssetRow
              playerId={a.id}
              name={a.name}
              position={a.position}
              team={a.team}
              value={a.value}
              className="px-4 sm:px-5 border-t border-[#111111]"
            />
          </Link>
        ))}
        {rosterAssets.length > 8 && (
          <button
            onClick={() => setShowFullRoster((v) => !v)}
            className="w-full py-2.5 text-[11px] text-[#555555] hover:text-white transition-colors border-t border-[#111111]"
          >
            {showFullRoster ? 'Show less' : `Show all ${rosterAssets.length} players`}
          </button>
        )}
      </div>
    </div>
  );
}
