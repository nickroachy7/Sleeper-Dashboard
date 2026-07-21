import { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { PositionBadge } from './PositionBadge';
import { AssetAvatar } from './AssetAvatar';
import { isPickAsset } from '../lib/vote-assets';
import type { AssetDetail } from '../hooks/usePairDetails';
import type { Player } from '../types/domain';

// ── PlayerVersus ─────────────────────────────────────────────────────────────
// One self-contained head-to-head of two assets (players or picks): two tappable
// player headers up top, then the decision context as ALIGNED ROWS (each metric
// is one row with both players' numbers side-by-side, the leader accented), and
// finally a single COMBINED value chart plotting both players' history on one
// shared scale (color-coded + legend) so their trajectories compare directly.
//
// A strict two-column inner grid with min-w-0 means it can never overflow the
// page. Reusable via `variant`:
//   • 'vote'     — the player headers are tap targets; onPick(side) fires. (Rank 'Em, feed)
//   • 'readonly' — pure display, no picking. (chat, embeds)
// The component owns no vote logic — the caller decides what a pick does — so it
// drops into any surface.

export interface CompareSide {
  player: Player;
  /** Community value (the market number). */
  value: number | null;
  overallRank: number | null;
  positionRank: number | null;
  detail: AssetDetail | undefined;
}

// Two CVD-distinguishable series colors, validated on the dark surface.
const COLOR_A = '#22c55e'; // accent green
const COLOR_B = '#38bdf8'; // sky blue

type Winner = 0 | 1 | null;

/** Which side leads a metric. `higher` = a bigger number wins. */
function lead(x: number | null | undefined, y: number | null | undefined, higher = true): Winner {
  if (x == null || y == null || x === y) return null;
  return (higher ? x > y : x < y) ? 0 : 1;
}

// ── Combined dual-line value chart ───────────────────────────────────────────
// Purpose-built (not the single-series ValueChart): two lines on one shared
// y-scale over the union of both date ranges, with y gridlines, an x date axis,
// endpoint dots, and a value label pinned to each line's current point.

// Extra right margin leaves room for the endpoint value labels.
const M = { top: 12, right: 52, bottom: 24, left: 42 };

function fmtMonth(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function CombinedChart({
  seriesA, seriesB, height = 176,
}: {
  seriesA: { date: string; value: number }[];
  seriesB: { date: string; value: number }[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setWidth(e[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plot = useMemo(() => {
    const all = [...seriesA, ...seriesB];
    if (all.length < 2 || width < 80) return null;
    const w = width - M.left - M.right;
    const h = height - M.top - M.bottom;
    const times = all.map((d) => new Date(d.date + 'T00:00:00').getTime());
    const t0 = Math.min(...times), t1 = Math.max(...times);
    const tSpan = t1 - t0 || 1;
    let vMin = Math.min(...all.map((d) => d.value));
    let vMax = Math.max(...all.map((d) => d.value));
    if (vMin === vMax) { vMin -= 1; vMax += 1; }
    const pad = (vMax - vMin) * 0.08;
    vMin -= pad; vMax += pad;
    const x = (iso: string) => M.left + ((new Date(iso + 'T00:00:00').getTime() - t0) / tSpan) * w;
    const y = (v: number) => M.top + h - ((v - vMin) / (vMax - vMin)) * h;
    const pathOf = (s: { date: string; value: number }[]) =>
      s.length < 2 ? '' : s.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(d.date)},${y(d.value)}`).join('');
    // ~4 round y ticks
    const span = vMax - vMin;
    const rawStep = span / 3;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const stepV = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= 4) || 10 * mag;
    const yTicks: { v: number; py: number }[] = [];
    for (let t = Math.ceil(vMin / stepV) * stepV; t <= vMax; t += stepV) yTicks.push({ v: t, py: y(t) });

    // x date ticks: ~4 evenly spaced across the shared range, min 56px apart.
    const uniq = [...new Set(all.map((d) => d.date))].sort();
    const xTicks: { px: number; label: string }[] = [];
    const nTicks = Math.min(4, uniq.length);
    for (let i = 0; i < nTicks; i++) {
      const d = uniq[Math.round((i / Math.max(nTicks - 1, 1)) * (uniq.length - 1))];
      const px = x(d);
      if (xTicks.length && px - xTicks[xTicks.length - 1].px < 56) continue;
      xTicks.push({ px, label: fmtMonth(d) });
    }

    const endOf = (s: { date: string; value: number }[]) =>
      s.length ? { px: x(s[s.length - 1].date), py: y(s[s.length - 1].value), value: s[s.length - 1].value } : null;
    let endA = endOf(seriesA);
    let endB = endOf(seriesB);
    // Nudge the two value labels apart if their endpoints nearly overlap.
    if (endA && endB && Math.abs(endA.py - endB.py) < 12) {
      if (endA.value >= endB.value) { endA = { ...endA, py: endA.py - 6 }; endB = { ...endB, py: endB.py + 6 }; }
      else { endA = { ...endA, py: endA.py + 6 }; endB = { ...endB, py: endB.py - 6 }; }
    }
    return { pathA: pathOf(seriesA), pathB: pathOf(seriesB), yTicks, xTicks, endA, endB, chartRight: width - M.right };
  }, [seriesA, seriesB, width, height]);

  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {plot && (
        <svg width={width} height={height} className="block">
          {plot.yTicks.map(({ v, py }) => (
            <g key={v}>
              <line x1={M.left} x2={plot.chartRight} y1={py} y2={py} stroke="#1a1a1a" strokeWidth={1} />
              <text x={M.left - 6} y={py + 3} textAnchor="end" fontSize={9} fill="#555555" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(v).toLocaleString()}
              </text>
            </g>
          ))}
          {plot.xTicks.map(({ px, label }) => (
            <text key={label} x={px} y={height - 7} textAnchor="middle" fontSize={9} fill="#555555">{label}</text>
          ))}
          {plot.pathA && <path d={plot.pathA} fill="none" stroke={COLOR_A} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {plot.pathB && <path d={plot.pathB} fill="none" stroke={COLOR_B} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {plot.endA && (
            <>
              <circle cx={plot.endA.px} cy={plot.endA.py} r={3.5} fill={COLOR_A} stroke="#0a0a0a" strokeWidth={2} />
              <text x={plot.chartRight + 6} y={plot.endA.py + 3} fontSize={10} fontWeight={700} fill={COLOR_A} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(plot.endA.value).toLocaleString()}
              </text>
            </>
          )}
          {plot.endB && (
            <>
              <circle cx={plot.endB.px} cy={plot.endB.py} r={3.5} fill={COLOR_B} stroke="#0a0a0a" strokeWidth={2} />
              <text x={plot.chartRight + 6} y={plot.endB.py + 3} fontSize={10} fontWeight={700} fill={COLOR_B} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(plot.endB.value).toLocaleString()}
              </text>
            </>
          )}
        </svg>
      )}
    </div>
  );
}

// ── Aligned stat row ─────────────────────────────────────────────────────────
function Row({
  label, a, b, winner,
}: {
  label: string;
  a: React.ReactNode;
  b: React.ReactNode;
  winner: Winner;
}) {
  const cell = (node: React.ReactNode, isWin: boolean) => (
    <span className={`font-display text-[14px] font-bold tabular-nums truncate ${isWin ? 'text-emerald-400' : 'text-white'}`}>
      {node}
    </span>
  );
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2 border-t border-line-subtle first:border-t-0">
      <div className="min-w-0 text-left">{cell(a, winner === 0)}</div>
      <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-faint text-center whitespace-nowrap px-1">{label}</span>
      <div className="min-w-0 text-right">{cell(b, winner === 1)}</div>
    </div>
  );
}

function TrendCell({ delta }: { delta: number | null | undefined }) {
  if (delta == null || Math.abs(delta) < 50) {
    return <span className="inline-flex items-center gap-0.5 text-faint"><Minus className="h-3 w-3" />Flat</span>;
  }
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}{Math.round(delta).toLocaleString()}
    </span>
  );
}

/** One-line contextual read — a light "what's the story", not a projection. */
function quickRead(side: CompareSide): string {
  const { detail, player } = side;
  if (isPickAsset(player.player_id)) return 'Future rookie capital.';
  const age = detail?.age ?? null;
  const t = detail?.trend30 ?? null;
  const bits: string[] = [];
  if (t != null && Math.abs(t) >= 50) bits.push(t > 0 ? 'rising' : 'slipping');
  if (age != null) {
    if (age <= 23) bits.push('young');
    else if (age >= 29 && player.position === 'RB') bits.push('RB age risk');
    else if (age >= 30) bits.push('aging');
  }
  const inj = detail?.injury_status;
  if (inj && !['na', 'active', 'healthy'].includes(inj.toLowerCase())) bits.push(inj.toLowerCase());
  if (!bits.length) return 'Settled value.';
  return bits.join(' · ').replace(/^./, (c) => c.toUpperCase());
}

function Header({
  side, color, variant, highlighted, disabled, onPick,
}: {
  side: CompareSide;
  color: string;
  variant: 'vote' | 'readonly';
  highlighted: boolean;
  disabled: boolean;
  onPick?: () => void;
}) {
  const { player } = side;
  const inner = (
    <div className="min-w-0 flex flex-col items-center text-center gap-1.5">
      <AssetAvatar id={player.player_id} alt={player.full_name} size={64} />
      <div className="min-w-0 w-full">
        <p className="text-[14px] font-semibold text-white truncate leading-tight">{player.full_name}</p>
        <span className="mt-1 inline-flex items-center gap-1.5">
          <PositionBadge position={player.position} />
          {player.team && <span className="text-[11px] text-faint">{player.team}</span>}
        </span>
      </div>
      {/* Color key tying this player to their chart line. */}
      <span className="inline-flex items-center gap-1.5 text-[10px] text-faint">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {quickRead(side)}
      </span>
    </div>
  );
  // Borderless — the parent card supplies the frame. A ring + tint marks the
  // just-picked side in vote mode.
  const base = `rounded-xl p-3 transition-all ${highlighted ? 'bg-accent-500/10 ring-1 ring-accent-500' : ''}`;
  if (variant === 'vote') {
    return (
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        className={`${base} hover:bg-elevated disabled:cursor-default`}
      >
        {inner}
      </button>
    );
  }
  return <div className={base}>{inner}</div>;
}

export interface PlayerVersusProps {
  a: CompareSide;
  b: CompareSide;
  /** 'vote' = tappable headers (calls onPick); 'readonly' = display only. */
  variant?: 'vote' | 'readonly';
  /** Which side is flashing as just-picked (vote variant). */
  pickedIndex?: 0 | 1 | null;
  disabled?: boolean;
  onPick?: (sideIndex: 0 | 1) => void;
}

export function PlayerVersus({ a, b, variant = 'vote', pickedIndex = null, disabled = false, onPick }: PlayerVersusProps) {
  const pick = isPickAsset(a.player.player_id) || isPickAsset(b.player.player_id);
  const chartA = (a.detail?.history ?? []).map((h) => ({ date: h.date, value: h.value }));
  const chartB = (b.detail?.history ?? []).map((h) => ({ date: h.date, value: h.value }));
  const hasChart = chartA.length >= 2 || chartB.length >= 2;

  return (
    <div>
      {/* One unified card: headers → stats → chart, split by hairline dividers. */}
      <div className="rounded-2xl border border-line bg-surface overflow-hidden">
        {/* Section 1 — two tappable player headers, straddled by an OR badge. */}
        <div className="relative grid grid-cols-2 gap-2 items-stretch p-1.5">
          <Header side={a} color={COLOR_A} variant={variant} highlighted={pickedIndex === 0} disabled={disabled} onPick={() => onPick?.(0)} />
          <Header side={b} color={COLOR_B} variant={variant} highlighted={pickedIndex === 1} disabled={disabled} onPick={() => onPick?.(1)} />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-surface border border-line flex items-center justify-center text-[10px] font-bold tracking-widest uppercase text-muted pointer-events-none">
            or
          </span>
        </div>

        {/* Section 2 — aligned comparison: each metric one row, both sides. */}
        <div className="border-t border-line-subtle px-3 sm:px-4 py-1">
          <Row label="Value"
            a={a.value != null ? Math.round(a.value).toLocaleString() : '—'}
            b={b.value != null ? Math.round(b.value).toLocaleString() : '—'}
            winner={lead(a.value, b.value)} />
          <Row label="Rank"
            a={a.overallRank ? `#${a.overallRank}` : '—'}
            b={b.overallRank ? `#${b.overallRank}` : '—'}
            winner={lead(a.overallRank, b.overallRank, false)} />
          {!pick && (
            <Row label="Pos Rank"
              a={a.positionRank ? `${a.player.position}${a.positionRank}` : '—'}
              b={b.positionRank ? `${b.player.position}${b.positionRank}` : '—'}
              winner={lead(a.positionRank, b.positionRank, false)} />
          )}
          {!pick && (
            <Row label="Age"
              a={a.detail?.age != null ? a.detail.age : '—'}
              b={b.detail?.age != null ? b.detail.age : '—'}
              winner={lead(a.detail?.age ?? null, b.detail?.age ?? null, false)} />
          )}
          {!pick && (
            // Trend keeps its own up/down red/green semantics, so no winner accent
            // here — a "winning" but still-negative trend shouldn't read as green.
            <Row label="30d Trend"
              a={<TrendCell delta={a.detail?.trend30} />}
              b={<TrendCell delta={b.detail?.trend30} />}
              winner={null} />
          )}
        </div>

        {/* Section 3 — one combined value chart (both players, shared scale). */}
        <div className="border-t border-line-subtle px-3 sm:px-4 pt-3 pb-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-bold text-faint uppercase tracking-[0.14em]">Value history</p>
            <div className="flex items-center gap-3 text-[10px] min-w-0">
              <span className="inline-flex items-center gap-1 min-w-0"><span className="h-2 w-2 rounded-full shrink-0" style={{ background: COLOR_A }} /><span className="truncate text-muted max-w-[80px]">{a.player.full_name}</span></span>
              <span className="inline-flex items-center gap-1 min-w-0"><span className="h-2 w-2 rounded-full shrink-0" style={{ background: COLOR_B }} /><span className="truncate text-muted max-w-[80px]">{b.player.full_name}</span></span>
            </div>
          </div>
          {hasChart ? (
            <CombinedChart seriesA={chartA} seriesB={chartB} />
          ) : (
            <div className="h-[140px] flex items-center justify-center text-[11px] text-ghost">
              {pick ? 'Pick value moves with the rookie class' : 'Not enough value history yet'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
