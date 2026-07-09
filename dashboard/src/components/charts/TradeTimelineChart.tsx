import { useMemo, useRef, useState, useLayoutEffect, useCallback } from 'react';
import { CHART_SURFACE as SURFACE, CHART_GRID as GRID, CHART_TEXT_MUTED as TEXT_MUTED } from './theme';

export interface TimelineSeries {
  label: string;
  color: string;
  points: { date: string; value: number }[];
}

interface TradeTimelineChartProps {
  series: TimelineSeries[];
  height?: number;
  formatValue?: (v: number) => string;
  /** ISO date to mark with a vertical line (e.g. the day the trade was made). */
  markerDate?: string;
  markerLabel?: string;
  /** Show the color/label legend above the plot. Off when the caller renders its own. */
  showLegend?: boolean;
}

const M = { top: 12, right: 16, bottom: 24, left: 46 };

const fmtDefault = (v: number) => Math.round(v).toLocaleString();
const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
const fmtDateFull = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

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

/**
 * Multi-series value-over-time chart — same visual grammar as ValueChart, but
 * overlays several lines (one per trade side) on a shared date/value scale with
 * a legend and a crosshair that reads every series at the hovered date.
 */
export function TradeTimelineChart({ series, height = 260, formatValue = fmtDefault, markerDate, markerLabel, showLegend = true }: TradeTimelineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plot = useMemo(() => {
    const all = series.flatMap((s) => s.points);
    if (!all.length || width < 80) return null;

    const w = width - M.left - M.right;
    const h = height - M.top - M.bottom;

    const times = all.map((d) => new Date(d.date + 'T00:00:00').getTime());
    const t0 = Math.min(...times);
    const t1 = Math.max(...times);
    const tSpan = t1 - t0 || 1;

    let vMin = Math.min(...all.map((d) => d.value));
    let vMax = Math.max(...all.map((d) => d.value));
    if (vMin === vMax) { vMin -= 1; vMax += 1; }
    const pad = (vMax - vMin) * 0.08;
    vMin = Math.max(0, vMin - pad); vMax += pad;

    const x = (iso: string) => M.left + ((new Date(iso + 'T00:00:00').getTime() - t0) / tSpan) * w;
    const y = (v: number) => M.top + h - ((v - vMin) / (vMax - vMin)) * h;

    const lines = series.map((s) => {
      const pts = s.points.map((d) => ({ px: x(d.date), py: y(d.value), ...d }));
      let linePath = '';
      pts.forEach((p, i) => { linePath += i === 0 ? `M${p.px},${p.py}` : `L${p.px},${p.py}`; });
      const areaPath = pts.length
        ? `${linePath}L${pts[pts.length - 1].px},${M.top + h}L${pts[0].px},${M.top + h}Z`
        : '';
      return { ...s, pts, linePath, areaPath };
    });

    // Trade-date marker, only if it falls within the visible range.
    const markerT = markerDate ? new Date(markerDate + 'T00:00:00').getTime() : null;
    const markerX = markerT != null && markerT >= t0 && markerT <= t1 ? x(markerDate!) : null;

    // Shared, sorted union of dates for the crosshair to snap to.
    const unionDates = [...new Set(all.map((d) => d.date))].sort();

    // X ticks: ~5 evenly spaced, deduped by label, min 48px apart.
    const tickCount = Math.min(5, unionDates.length);
    const xTicks: { px: number; label: string }[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < tickCount; i++) {
      const idx = Math.round((i / Math.max(tickCount - 1, 1)) * (unionDates.length - 1));
      const iso = unionDates[idx];
      const label = fmtDate(iso);
      const px = x(iso);
      if (seen.has(label)) continue;
      if (xTicks.length && px - xTicks[xTicks.length - 1].px < 48) continue;
      seen.add(label);
      xTicks.push({ px, label });
    }

    return {
      w, h, lines, x, y, unionDates, markerX,
      yTicks: niceTicks(vMin, vMax).map((v) => ({ v, py: y(v) })),
      xTicks,
    };
  }, [series, width, height, markerDate]);

  const onMove = useCallback((clientX: number) => {
    if (!plot) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const px = clientX - rect.left;
    let best = plot.unionDates[0], bestDist = Infinity;
    plot.unionDates.forEach((iso) => {
      const d = Math.abs(plot.x(iso) - px);
      if (d < bestDist) { bestDist = d; best = iso; }
    });
    setHoverDate(best);
  }, [plot]);

  // For the hovered date, the last-known value of each series at-or-before it.
  const hover = useMemo(() => {
    if (!plot || !hoverDate) return null;
    const px = plot.x(hoverDate);
    const rows = series.map((s) => {
      let val: number | null = null;
      for (const p of s.points) {
        if (p.date <= hoverDate) val = p.value; else break;
      }
      return { label: s.label, color: s.color, value: val };
    });
    return { px, date: hoverDate, rows };
  }, [plot, hoverDate, series]);

  return (
    <div>
      {/* Legend */}
      {showLegend && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
          {series.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className="w-3 h-[3px] rounded-full" style={{ backgroundColor: s.color }} />
              <span className="text-[11px] text-[#9c9ca7] truncate max-w-[160px]">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      <div
        ref={containerRef}
        className="relative w-full select-none"
        style={{ height }}
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHoverDate(null)}
        role="img"
        aria-label={`Trade value over time for ${series.map((s) => s.label).join(' and ')}`}
      >
        {!plot && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[#555555]">
            Not enough value history yet to chart this trade.
          </div>
        )}
        {plot && (
          <svg width={width} height={height} className="block">
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

            {/* Trade-date marker */}
            {plot.markerX != null && (
              <g>
                <line
                  x1={plot.markerX} x2={plot.markerX} y1={M.top} y2={M.top + plot.h}
                  stroke="#6b7280" strokeWidth={1} strokeDasharray="3 3"
                />
                <text
                  x={Math.min(plot.markerX + 4, width - M.right - 2)} y={M.top + 9}
                  fontSize={9} fill="#9c9ca7" style={{ fontWeight: 700 }}
                >
                  {markerLabel || 'Trade'}
                </text>
              </g>
            )}

            {plot.lines.map((ln) => (
              <g key={ln.label}>
                {ln.areaPath && <path d={ln.areaPath} fill={ln.color} opacity={0.08} />}
                <path d={ln.linePath} fill="none" stroke={ln.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {ln.pts.length > 0 && (() => {
                  const last = ln.pts[ln.pts.length - 1];
                  return <circle cx={last.px} cy={last.py} r={3.5} fill={ln.color} stroke={SURFACE} strokeWidth={2} />;
                })()}
              </g>
            ))}

            {hover && (
              <>
                <line x1={hover.px} x2={hover.px} y1={M.top} y2={M.top + plot.h} stroke="#333333" strokeWidth={1} />
                {hover.rows.map((r) => r.value !== null && (
                  <circle key={r.label} cx={hover.px} cy={plot.y(r.value)} r={3.5} fill={r.color} stroke={SURFACE} strokeWidth={2} />
                ))}
              </>
            )}
          </svg>
        )}

        {hover && plot && (
          <div
            className="absolute pointer-events-none bg-[#161616] border border-[#2a2a2a] rounded-lg px-2.5 py-1.5 z-10"
            style={{ left: Math.min(Math.max(hover.px - 60, 0), width - 130), top: 4 }}
          >
            <div className="text-[10px] text-[#888888] whitespace-nowrap mb-1">{fmtDateFull(hover.date)}</div>
            {hover.rows.map((r) => (
              <div key={r.label} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                <span className="text-[11px] font-bold text-white tabular-nums">
                  {r.value !== null ? formatValue(r.value) : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
