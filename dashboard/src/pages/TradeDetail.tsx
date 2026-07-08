import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useTradeDetail, useLeagueDirectory, useRosterValueHistory } from '../hooks/detail';
import { usePlayerValues, usePickValues, usePlayers } from '../hooks/queries';
import { playerMoves, txDraftPicks, lookupPickValue } from '../lib/trade-shared';
import { TradeCard, type TradeSide } from '../components/TradeCard';
import { TradeTimelineChart, type TimelineSeries } from '../components/charts/TradeTimelineChart';
import { CHART_POS } from '../components/charts/theme';

const SIDE_COLORS = [CHART_POS, '#3b82f6', '#f59e0b', '#a855f7'];

function ordinal(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

/** Value of a series at-or-before a timestamp (last known point). */
function valueAt(points: { date: string; value: number }[], iso: string): number | null {
  let v: number | null = null;
  for (const p of points) {
    if (p.date <= iso) v = p.value; else break;
  }
  return v ?? (points[0]?.value ?? null);
}

export default function TradeDetail() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const { data: detail, isLoading } = useTradeDetail(transactionId);
  const { data: directory } = useLeagueDirectory();
  const { data: playerValues } = usePlayerValues();
  const { data: pickValues } = usePickValues();
  const { data: players } = usePlayers();

  const playerMeta = useMemo(() => {
    const m = new Map<string, { name: string; position: string; team: string | null }>();
    (players || []).forEach((p) => m.set(p.player_id, { name: p.full_name, position: p.position || '', team: p.team ?? null }));
    return m;
  }, [players]);

  const tx = detail?.transaction ?? null;
  const resolution = detail?.resolution;

  // ── Build each side (received players + received picks) ──
  const built = useMemo(() => {
    if (!tx || !directory || !playerValues) return null;
    const adds = playerMoves(tx.adds);
    const picks = txDraftPicks(tx.draft_picks);
    const rosterIds: number[] = (tx.roster_ids as number[]) || [];

    const sides = rosterIds.map((rosterId) => {
      // Directly received players
      const playerIds = Object.keys(adds).filter((pid) => Number(adds[pid]) === Number(rosterId));
      const players = playerIds.map((pid) => {
        const pv = playerValues.get(pid);
        const meta = playerMeta.get(pid);
        return {
          id: pid,
          name: pv?.player.full_name || meta?.name || 'Unknown',
          position: pv?.player.position || meta?.position || '',
          team: pv?.player.team ?? meta?.team ?? null,
          value: pv?.value ?? 0,
        };
      });

      // Received picks — resolve to the drafted player when the draft has happened
      const timelinePlayerIds = [...playerIds];
      const sidePicks = picks
        .filter((p) => Number(p.owner_id) === Number(rosterId))
        .map((p) => {
          const key = `${p.season}-${p.round}-${p.roster_id}`;
          const resolved = resolution?.get(key);
          if (resolved) {
            const rpv = playerValues.get(resolved.playerId);
            timelinePlayerIds.push(resolved.playerId);
            return {
              season: String(p.season),
              round: Number(p.round),
              value: rpv?.value ?? 0,
              name: `${p.season} ${ordinal(Number(p.round))} → ${rpv?.player.full_name || 'drafted pick'}`,
              resolvedPlayerId: resolved.playerId,
            };
          }
          return {
            season: String(p.season),
            round: Number(p.round),
            value: pickValues ? lookupPickValue(pickValues, String(p.season), Number(p.round), { tier: 'Mid' }) : 0,
            name: `${p.season} ${ordinal(Number(p.round))} pick`,
          };
        });

      const totalValue =
        players.reduce((s, p) => s + p.value, 0) + sidePicks.reduce((s, p) => s + (p.value || 0), 0);

      const side: TradeSide & { rosterId: number; timelinePlayerIds: string[] } = {
        rosterId,
        teamName: directory.teamName(rosterId, tx.league_id),
        players,
        picks: sidePicks,
        totalValue,
        timelinePlayerIds,
      };
      return side;
    });

    return { sides };
  }, [tx, directory, playerValues, pickValues, resolution, playerMeta]);

  // Two-sided value history (hooks must run unconditionally → always call twice)
  const sideAIds = built?.sides[0]?.timelinePlayerIds ?? [];
  const sideBIds = built?.sides[1]?.timelinePlayerIds ?? [];
  const { data: histA } = useRosterValueHistory(sideAIds);
  const { data: histB } = useRosterValueHistory(sideBIds);

  const tradeIso = tx?.created ? new Date(tx.created).toISOString().slice(0, 10) : null;

  const chart = useMemo(() => {
    if (!built || built.sides.length < 2) return null;
    const series: TimelineSeries[] = [];
    const feeds = [histA, histB];
    built.sides.slice(0, 2).forEach((side, i) => {
      const pts = feeds[i];
      if (pts && pts.length) {
        series.push({ label: side.teamName, color: SIDE_COLORS[i], points: pts });
      }
    });
    if (series.length < 2) return null;

    // then → now readout per side
    const readouts = built.sides.slice(0, 2).map((side, i) => {
      const pts = feeds[i] || [];
      const now = pts[pts.length - 1]?.value ?? null;
      const then = tradeIso ? valueAt(pts, tradeIso) : null;
      return { teamName: side.teamName, color: SIDE_COLORS[i], then, now };
    });
    return { series, readouts };
  }, [built, histA, histB, tradeIso]);

  if (isLoading || !detail) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-4 mt-4">
        <div className="skeleton h-40 w-full rounded-xl" />
        <div className="skeleton h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!tx || tx.type !== 'trade' || !built) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto text-center py-16">
        <p className="text-sm text-[#75757f]">Trade not found.</p>
        <Link to="/transactions" className="text-xs text-accent-400 mt-2 inline-block">Back to Transactions</Link>
      </div>
    );
  }

  const tradeDate = tx.created
    ? new Date(tx.created).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : undefined;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-4">
      <Link to="/transactions" className="inline-flex items-center gap-1.5 text-[11px] text-[#75757f] hover:text-white transition-colors">
        <ArrowLeft className="h-3 w-3" /> Transactions
      </Link>

      {/* ── Full trade ── */}
      <TradeCard sides={built.sides} date={tradeDate} linkPlayers />

      {/* ── Value over time ── */}
      <div className="bg-[#141419] rounded-xl p-4 sm:p-5 border border-[#22222b]">
        <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-1">Value since the trade</h2>
        <p className="text-[10px] text-[#75757f] mb-4">
          KTC value of what each side received, over time. Picks already used are tracked as the player drafted;
          future picks aren&apos;t charted (no historical value).
        </p>

        {chart ? (
          <>
            <TradeTimelineChart series={chart.series} height={260} />

            {/* then → now per side */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              {chart.readouts.map((r) => {
                const delta = r.now != null && r.then != null ? r.now - r.then : null;
                return (
                  <div key={r.teamName} className="bg-[#17171d] rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                      <span className="text-[11px] text-[#9c9ca7] truncate">{r.teamName}</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-lg font-bold text-white tabular-nums">
                        {r.now != null ? r.now.toLocaleString() : '—'}
                      </span>
                      {delta != null && (
                        <span className={`text-[12px] font-semibold tabular-nums flex items-center gap-0.5 ${
                          delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-[#75757f]'
                        }`}>
                          {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                          {delta > 0 ? '+' : ''}{delta.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[#60606a] mt-0.5">
                      {r.then != null ? `${r.then.toLocaleString()} at trade` : 'no value at trade date'}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="py-8 text-center text-[11px] text-[#60606a]">
            Not enough value history to chart this trade yet — this happens for pick-only trades or trades
            older than our value data.
          </p>
        )}
      </div>
    </div>
  );
}
