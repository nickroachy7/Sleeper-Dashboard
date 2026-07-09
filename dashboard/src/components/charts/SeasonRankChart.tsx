import { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { CHART_SURFACE as SURFACE, CHART_GRID as GRID, CHART_TEXT_MUTED as TEXT_MUTED } from './theme';
import type { SeasonRankPoint } from '../../hooks/detail';

interface SeasonRankChartProps {
  data: SeasonRankPoint[];
  height?: number;
}

const M = { top: 16, right: 16, bottom: 28, left: 34 };
const POWER = '#22c55e';   // roster talent
const FINISH = '#a855f7';  // actual standings

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/**
 * Two rank lines per season on an inverted axis (1st at top, last at bottom):
 * POWER rank (roster talent, green) and FINISH rank (actual standings, purple).
 * Rising = climbing the league; the gap between the lines = over- or
 * under-achieving relative to roster strength. Ranks are league-relative so
 * they dodge the value-inflation problem raw-dollar charts had.
 */
export function SeasonRankChart({ data, height = 240 }: SeasonRankChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plot = useMemo(() => {
    if (data.length < 1 || width < 80) return null;
    const w = width - M.left - M.right;
    const h = height - M.top - M.bottom;
    const teams = Math.max(...data.map((d) => d.teams), 12);

    const n = data.length;
    const x = (i: number) => M.left + (n === 1 ? w / 2 : (i / (n - 1)) * w);
    // Rank 1 at top, `teams` at bottom (inverted).
    const y = (rank: number) => M.top + ((rank - 1) / (teams - 1)) * h;

    const pts = data.map((d, i) => ({
      ...d,
      px: x(i),
      powerY: y(d.powerRank),
      finishY: d.finishRank != null ? y(d.finishRank) : null,
    }));

    const line = (key: 'powerY' | 'finishY') => {
      const seg = pts.filter((p) => p[key] != null);
      return seg.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.px},${p[key]}`).join('');
    };

    // Y gridlines at 1st, mid, last.
    const rankTicks = [1, Math.ceil(teams / 2), teams].map((r) => ({ r, py: y(r) }));

    return { w, h, pts, powerLine: line('powerY'), finishLine: line('finishY'), rankTicks };
  }, [data, width, height]);

  const hover = hoverIdx !== null && plot ? plot.pts[hoverIdx] : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ height }}
      role="img"
      aria-label="Power rank and finish rank by season"
    >
      {data.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[#555555]">
          Not enough season history yet.
        </div>
      )}
      {plot && (
        <svg width={width} height={height} className="block" onPointerLeave={() => setHoverIdx(null)}>
          {plot.rankTicks.map(({ r, py }) => (
            <g key={r}>
              <line x1={M.left} x2={width - M.right} y1={py} y2={py} stroke={GRID} strokeWidth={1} />
              <text x={M.left - 6} y={py + 3} textAnchor="end" fontSize={10} fill={TEXT_MUTED}>{ordinal(r)}</text>
            </g>
          ))}
          {plot.pts.map((p) => (
            <text key={p.season} x={p.px} y={height - 8} textAnchor="middle" fontSize={10} fill={TEXT_MUTED}>{p.season}</text>
          ))}

          {/* Finish line (purple, dashed — "results") */}
          {plot.finishLine && (
            <path d={plot.finishLine} fill="none" stroke={FINISH} strokeWidth={2} strokeDasharray="5 3" strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
          )}
          {/* Power line (green, solid — "talent") */}
          <path d={plot.powerLine} fill="none" stroke={POWER} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

          {/* Markers */}
          {plot.pts.map((p, i) => (
            <g key={p.season} onPointerEnter={() => setHoverIdx(i)}>
              {p.finishY != null && <circle cx={p.px} cy={p.finishY} r={hoverIdx === i ? 5 : 4} fill={FINISH} stroke={SURFACE} strokeWidth={2} />}
              <circle cx={p.px} cy={p.powerY} r={hoverIdx === i ? 6 : 5} fill={POWER} stroke={SURFACE} strokeWidth={2} />
              <rect x={p.px - 22} y={M.top} width={44} height={plot.h} fill="transparent" />
            </g>
          ))}
        </svg>
      )}

      {/* Legend */}
      {plot && (
        <div className="absolute top-0 right-4 flex items-center gap-3 text-[10px] text-[#75757f]">
          <span className="flex items-center gap-1"><span className="w-3 h-[3px] rounded-full" style={{ backgroundColor: POWER }} />Roster power</span>
          <span className="flex items-center gap-1"><span className="w-3 border-t-2 border-dashed" style={{ borderColor: FINISH }} />Finish</span>
        </div>
      )}

      {hover && plot && (
        <div
          className="absolute pointer-events-none bg-[#161616] border border-[#2a2a2a] rounded-lg px-2.5 py-1.5 z-10"
          style={{ left: Math.min(Math.max(hover.px - 55, 0), width - 130), top: 4 }}
        >
          <div className="text-[10px] text-[#888888] mb-0.5">{hover.season}</div>
          <div className="text-[12px] font-bold tabular-nums" style={{ color: POWER }}>
            {ordinal(hover.powerRank)} in talent
          </div>
          {hover.finishRank != null ? (
            <div className="text-[12px] font-bold tabular-nums" style={{ color: FINISH }}>
              {ordinal(hover.finishRank)} finish · {hover.wins}-{hover.losses}
            </div>
          ) : (
            <div className="text-[10px] text-[#60606a]">season in progress</div>
          )}
        </div>
      )}
    </div>
  );
}
