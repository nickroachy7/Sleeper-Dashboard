import { useMemo, useRef, useState, useLayoutEffect, useCallback, useId } from 'react';
import { CHART_POS as POS, CHART_NEG as NEG, CHART_SURFACE as SURFACE, CHART_GRID as GRID, CHART_TEXT_MUTED as TEXT_MUTED } from './theme';

export interface ChartPoint {
  /** ISO date (YYYY-MM-DD) */
  date: string;
  value: number;
}

interface ValueChartProps {
  data: ChartPoint[];
  height?: number;
  /** Series color for the line/area (validated for the #0a0a0a surface) */
  color?: string;
  /** Diverging mode: green above zero, red below, zero baseline emphasized */
  diverging?: boolean;
  /** Format values for ticks + tooltip (default: thousands-comma) */
  formatValue?: (v: number) => string;
  /** Step interpolation (for cumulative ledgers) instead of linear */
  step?: boolean;
}

const M = { top: 12, right: 16, bottom: 24, left: 46 };

function fmtDefault(v: number): string {
  return Math.round(v).toLocaleString();
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function fmtDateFull(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Clean tick values: 4-5 round numbers spanning [min, max] */
function niceTicks(min: number, max: number): number[] {
  const span = max - min || 1;
  const rawStep = span / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= 5) || 10 * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max + 1e-9; t += step) ticks.push(t);
  return ticks;
}

export function ValueChart({
  data,
  height = 220,
  color = POS,
  diverging = false,
  formatValue = fmtDefault,
  step = false,
}: ValueChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const clipId = useId();

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plot = useMemo(() => {
    if (!data.length || width < 80) return null;
    const w = width - M.left - M.right;
    const h = height - M.top - M.bottom;

    const t0 = new Date(data[0].date + 'T00:00:00').getTime();
    const t1 = new Date(data[data.length - 1].date + 'T00:00:00').getTime();
    const tSpan = t1 - t0 || 1;

    let vMin = Math.min(...data.map((d) => d.value));
    let vMax = Math.max(...data.map((d) => d.value));
    if (diverging) { vMin = Math.min(vMin, 0); vMax = Math.max(vMax, 0); }
    if (vMin === vMax) { vMin -= 1; vMax += 1; }
    const pad = (vMax - vMin) * 0.06;
    vMin -= pad; vMax += pad;

    const x = (iso: string) => M.left + ((new Date(iso + 'T00:00:00').getTime() - t0) / tSpan) * w;
    const y = (v: number) => M.top + h - ((v - vMin) / (vMax - vMin)) * h;

    const pts = data.map((d) => ({ px: x(d.date), py: y(d.value), ...d }));

    let linePath = '';
    pts.forEach((p, i) => {
      if (i === 0) linePath = `M${p.px},${p.py}`;
      else if (step) linePath += `H${p.px}V${p.py}`;
      else linePath += `L${p.px},${p.py}`;
    });
    const baseY = diverging ? y(0) : M.top + h;
    const areaPath = `${linePath}L${pts[pts.length - 1].px},${baseY}L${pts[0].px},${baseY}Z`;

    // X ticks: ~5 evenly spaced by index, deduped by label, and never
    // closer than 48px to the previous tick (labels collide otherwise)
    const tickCount = Math.min(5, data.length);
    const xTicks: { px: number; label: string }[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < tickCount; i++) {
      const idx = Math.round((i / Math.max(tickCount - 1, 1)) * (data.length - 1));
      const label = fmtDate(data[idx].date);
      const px = pts[idx].px;
      if (seen.has(label)) continue;
      if (xTicks.length && px - xTicks[xTicks.length - 1].px < 48) continue;
      seen.add(label);
      xTicks.push({ px, label });
    }

    return { w, h, pts, linePath, areaPath, y, baseY, yTicks: niceTicks(vMin, vMax).map((v) => ({ v, py: y(v) })), xTicks, zeroY: y(0) };
  }, [data, width, height, diverging, step]);

  const onMove = useCallback((clientX: number) => {
    if (!plot) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const px = clientX - rect.left;
    let best = 0, bestDist = Infinity;
    plot.pts.forEach((p, i) => {
      const d = Math.abs(p.px - px);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    setHoverIdx(best);
  }, [plot]);

  const hover = hoverIdx !== null && plot ? plot.pts[hoverIdx] : null;
  const hoverColor = hover && diverging ? (hover.value >= 0 ? POS : NEG) : color;

  // NOTE: the measured container must render even while data is empty —
  // an early return would leave the ResizeObserver detached forever.
  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ height }}
      onPointerMove={(e) => onMove(e.clientX)}
      onPointerLeave={() => setHoverIdx(null)}
      tabIndex={0}
      role="img"
      aria-label={
        data.length
          ? `Value over time, ${data.length} points from ${fmtDateFull(data[0].date)} to ${fmtDateFull(data[data.length - 1].date)}`
          : 'Value over time, no data yet'
      }
      onKeyDown={(e) => {
        if (!plot) return;
        if (e.key === 'ArrowRight') setHoverIdx((i) => Math.min((i ?? 0) + 1, plot.pts.length - 1));
        if (e.key === 'ArrowLeft') setHoverIdx((i) => Math.max((i ?? plot.pts.length - 1) - 1, 0));
      }}
    >
      {!data.length && (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[#555555]">
          No history yet — values are snapshotted daily.
        </div>
      )}
      {plot && (
        <svg width={width} height={height} className="block">
          {/* gridlines (hairline, recessive) */}
          {plot.yTicks.map(({ v, py }) => (
            <g key={v}>
              <line x1={M.left} x2={width - M.right} y1={py} y2={py} stroke={GRID} strokeWidth={1} />
              <text x={M.left - 8} y={py + 3} textAnchor="end" fontSize={10} fill={TEXT_MUTED} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatValue(v)}
              </text>
            </g>
          ))}
          {plot.xTicks.map(({ px, label }) => (
            <text key={label} x={px} y={height - 8} textAnchor="middle" fontSize={10} fill={TEXT_MUTED}>
              {label}
            </text>
          ))}

          {diverging ? (
            <>
              <defs>
                <clipPath id={`${clipId}-pos`}><rect x={0} y={0} width={width} height={plot.zeroY} /></clipPath>
                <clipPath id={`${clipId}-neg`}><rect x={0} y={plot.zeroY} width={width} height={height - plot.zeroY} /></clipPath>
              </defs>
              {/* zero baseline, one step louder than grid */}
              <line x1={M.left} x2={width - M.right} y1={plot.zeroY} y2={plot.zeroY} stroke="#333333" strokeWidth={1} />
              <path d={plot.areaPath} fill={POS} opacity={0.1} clipPath={`url(#${clipId}-pos)`} />
              <path d={plot.areaPath} fill={NEG} opacity={0.1} clipPath={`url(#${clipId}-neg)`} />
              <path d={plot.linePath} fill="none" stroke={POS} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${clipId}-pos)`} />
              <path d={plot.linePath} fill="none" stroke={NEG} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${clipId}-neg)`} />
            </>
          ) : (
            <>
              <path d={plot.areaPath} fill={color} opacity={0.1} />
              <path d={plot.linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </>
          )}

          {/* endpoint marker with surface ring */}
          {(() => {
            const last = plot.pts[plot.pts.length - 1];
            const c = diverging ? (last.value >= 0 ? POS : NEG) : color;
            return <circle cx={last.px} cy={last.py} r={4} fill={c} stroke={SURFACE} strokeWidth={2} />;
          })()}

          {/* crosshair */}
          {hover && (
            <>
              <line x1={hover.px} x2={hover.px} y1={M.top} y2={M.top + plot.h} stroke="#333333" strokeWidth={1} />
              <circle cx={hover.px} cy={hover.py} r={4} fill={hoverColor} stroke={SURFACE} strokeWidth={2} />
            </>
          )}
        </svg>
      )}

      {/* tooltip: value leads, label follows */}
      {hover && plot && (
        <div
          className="absolute pointer-events-none bg-[#161616] border border-[#2a2a2a] rounded-lg px-2.5 py-1.5 z-10"
          style={{
            left: Math.min(Math.max(hover.px - 50, 0), width - 110),
            top: Math.max(hover.py - 52, 0),
          }}
        >
          <div className="text-[13px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {diverging && hover.value > 0 ? '+' : ''}{formatValue(hover.value)}
          </div>
          <div className="text-[10px] text-[#888888] whitespace-nowrap">{fmtDateFull(hover.date)}</div>
        </div>
      )}
    </div>
  );
}
