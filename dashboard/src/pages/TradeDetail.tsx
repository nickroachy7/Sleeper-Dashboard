import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useTradeDetail, useLeagueDirectory, useMultiRosterValueHistory } from '../hooks/detail';
import { usePlayerValues, usePickValues, usePlayers } from '../hooks/queries';
import { playerMoves, txDraftPicks, formatResolvedPick } from '../lib/trade-shared';
import { TradeCard, type TradeSide } from '../components/TradeCard';
import { TradeTimelineChart, type TimelineSeries } from '../components/charts/TradeTimelineChart';
import { CHART_POS, CHART_NEG } from '../components/charts/theme';

// Two-sided trades color by OUTCOME (winner green, loser red) so the chart reads
// the same as the W/L badges on the card below. Trades with 3+ sides (rare) fall
// back to a neutral identity palette — you can't have two "losers" in red.
const EVEN_COLOR = '#3b82f6';
const IDENTITY_COLORS = [CHART_POS, EVEN_COLOR, '#f59e0b', '#a855f7'];

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
  const latestValue = detail?.latestValue;
  const pickResolution = detail?.pickResolution;

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
          value: pv?.value ?? latestValue?.get(pid) ?? 0,
        };
      });

      // Received picks. Past picks resolve to the drafted player (and join the
      // value chart); future picks show their projected tier value. The display
      // fields come from the shared formatter so the transactions list matches.
      const timelinePlayerIds = [...playerIds];
      const sidePicks = picks
        .filter((p) => Number(p.owner_id) === Number(rosterId))
        .map((p) => {
          const res = pickResolution?.get(`${String(p.season)}-${Number(p.round)}-${p.roster_id}`);
          if (res?.playerId) timelinePlayerIds.push(res.playerId);
          return formatResolvedPick(p, res, {
            pickValues: pickValues ?? [],
            // Always the current team name (omit league id → resolves vs current league).
            origTeamName: directory.teamName(Number(p.roster_id)),
            playerValue: (pid) => playerValues.get(pid)?.value ?? latestValue?.get(pid),
            playerName: (pid) => playerValues.get(pid)?.player.full_name ?? playerMeta.get(pid)?.name,
          });
        });

      const totalValue =
        players.reduce((s, p) => s + p.value, 0) + sidePicks.reduce((s, p) => s + (p.value || 0), 0);

      // Future picks have no per-day history (they aren't a real player yet), so
      // their projected value is charted as a flat baseline added to this side's
      // line — otherwise the chart total wouldn't match the card total.
      const pickBaseline = sidePicks
        .filter((p) => !p.playerId)
        .reduce((s, p) => s + (p.value || 0), 0);

      const side: TradeSide & { rosterId: number; timelinePlayerIds: string[]; pickBaseline: number } = {
        rosterId,
        teamName: directory.teamName(rosterId), // current team name, not the historical season's
        players,
        picks: sidePicks,
        totalValue,
        timelinePlayerIds,
        pickBaseline,
      };
      return side;
    });

    return { sides };
  }, [tx, directory, playerValues, pickValues, playerMeta, latestValue, pickResolution]);

  // One value-history series per side — works for 2-, 3-, or 4-team trades.
  const historyInput = useMemo(
    () => built?.sides.map((s) => ({ playerIds: s.timelinePlayerIds, baseline: s.pickBaseline })),
    [built]
  );
  const { data: histories } = useMultiRosterValueHistory(historyInput);

  const tradeIso = tx?.created ? new Date(tx.created).toISOString().slice(0, 10) : null;

  // Outcome color per side. Two-team trades read as winner-green / loser-red;
  // 3+ team trades use a distinct identity color per side (no single "loser").
  const sideColors = useMemo(() => {
    if (!built) return [] as string[];
    if (built.sides.length !== 2) return built.sides.map((_, i) => IDENTITY_COLORS[i] ?? EVEN_COLOR);
    const [a, b] = built.sides.map((s) => s.adjustedValue ?? s.totalValue);
    if (a === b) return [EVEN_COLOR, EVEN_COLOR];
    return a > b ? [CHART_POS, CHART_NEG] : [CHART_NEG, CHART_POS];
  }, [built]);

  const chart = useMemo(() => {
    if (!built || built.sides.length < 2 || !histories) return null;
    const feeds = built.sides.map((_, i) => histories[i] ?? []);
    if (feeds.some((f) => f.length === 0)) return null;

    // Align every line to a shared start so none looks "cut off": begin where
    // ALL sides first have data (the latest of each side's first point).
    const firstDates = feeds.map((f) => f[0].date);
    const commonStart = [...firstDates].sort().reverse()[0];
    const clip = (pts: { date: string; value: number }[]) => pts.filter((p) => p.date >= commonStart);

    const series: TimelineSeries[] = built.sides.map((side, i) => ({
      label: side.teamName, color: sideColors[i], points: clip(feeds[i]),
    }));
    if (series.some((s) => s.points.length === 0)) return null;

    // then → now readout per side (value at trade date vs latest).
    const readouts = built.sides.map((side, i) => {
      const pts = feeds[i];
      const now = pts[pts.length - 1]?.value ?? null;
      const then = tradeIso ? valueAt(pts, tradeIso) : null;
      return { teamName: side.teamName, color: sideColors[i], then, now };
    });
    return { series, readouts, markerDate: tradeIso };
  }, [built, histories, tradeIso, sideColors]);

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
        <p className="text-sm text-faint">Trade not found.</p>
        <Link to="/league?tab=transactions" className="text-xs text-accent-400 mt-2 inline-block">Back to Transactions</Link>
      </div>
    );
  }

  const tradeDate = tx.created
    ? new Date(tx.created).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : undefined;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-4">
      {/* ── Value over time (on top) ── */}
      <div className="bg-surface rounded-2xl p-4 sm:p-5 border border-line">
        <p className="text-[11px] font-bold text-white tracking-[0.18em] uppercase mb-0.5">Value Since The Trade</p>
        <p className="text-[10px] text-faint mb-4">
          Community value of what each side received, over time. Used picks are tracked as the player drafted;
          future picks are charted at their projected tier value.
        </p>

        {chart ? (
          <>
            <TradeTimelineChart series={chart.series} height={200} markerDate={chart.markerDate ?? undefined} markerLabel="Trade" />

            {/* then → now per side — 2 columns for a 2-team trade, 3-up for larger */}
            <div className={`grid gap-3 mt-4 ${chart.readouts.length > 2 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
              {chart.readouts.map((r) => {
                const delta = r.now != null && r.then != null ? r.now - r.then : null;
                return (
                  <div key={r.teamName} className="bg-[#17171d] rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                      <span className="text-[11px] text-muted truncate">{r.teamName}</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-lg font-bold text-white tabular-nums">
                        {r.now != null ? r.now.toLocaleString() : '—'}
                      </span>
                      {delta != null && (
                        <span className={`text-[12px] font-semibold tabular-nums flex items-center gap-0.5 ${
                          delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-faint'
                        }`}>
                          {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                          {delta > 0 ? '+' : ''}{delta.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-ghost mt-0.5">
                      {r.then != null ? `${r.then.toLocaleString()} at trade` : 'no value at trade date'}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="py-8 text-center text-[11px] text-ghost">
            Not enough value history to chart this trade yet — this happens for pick-only trades or trades
            older than our value data.
          </p>
        )}
      </div>

      {/* ── Full trade ── */}
      <TradeCard sides={built.sides} date={tradeDate} linkPlayers />
    </div>
  );
}
