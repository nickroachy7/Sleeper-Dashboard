import { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { CHART_GRID as GRID, CHART_TEXT_MUTED as TEXT_MUTED } from './theme';
import type { PlayerWeek } from '../../hooks/detail';

interface WeeklyPointsChartProps {
  data: PlayerWeek[];
  height?: number;
}

const M = { top: 16, right: 14, bottom: 26, left: 26 };
const STARTED = '#22c55e';  // owner started him
const BENCHED = '#3f3f46';  // scored on the bench

/**
 * One bar per week of a player's in-league fantasy output. Green = the owning
 * team started him that week; gray = he scored on their bench (points they left
 * behind). The bottom axis is the week number.
 */
export function WeeklyPointsChart({ data, height = 190 }: WeeklyPointsChartProps) {
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
    const maxPts = Math.max(...data.map((d) => d.points), 10);
    const top = Math.ceil(maxPts / 5) * 5;

    const n = data.length;
    const slot = w / n;
    const barW = Math.min(slot * 0.66, 30);
    const x = (i: number) => M.left + i * slot + slot / 2;
    const y = (pts: number) => M.top + h - (pts / top) * h;

    const bars = data.map((d, i) => ({ ...d, cx: x(i), barW, topY: y(Math.max(d.points, 0)), baseY: M.top + h }));
    const ticks = [0, top / 2, top].map((v) => ({ v, py: y(v) }));
    return { w, h, bars, ticks, slot };
  }, [data, width, height]);

  const hover = hoverIdx !== null && plot ? plot.bars[hoverIdx] : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ height }}
      role="img"
      aria-label="Weekly fantasy points"
    >
      {data.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[#555555]">
          No weeks scored this season.
        </div>
      )}
      {plot && (
        <svg width={width} height={height} className="block" onPointerLeave={() => setHoverIdx(null)}>
          {plot.ticks.map(({ v, py }) => (
            <g key={v}>
              <line x1={M.left} x2={width - M.right} y1={py} y2={py} stroke={GRID} strokeWidth={1} />
              <text x={M.left - 6} y={py + 3} textAnchor="end" fontSize={10} fill={TEXT_MUTED}>{Math.round(v)}</text>
            </g>
          ))}
          {plot.bars.map((b, i) => {
            const active = hoverIdx === i;
            const barH = Math.max(b.baseY - b.topY, 0);
            const showLabel = plot.slot > 22 || i % 2 === 0; // thin out week labels when crowded
            return (
              <g key={b.week} onPointerEnter={() => setHoverIdx(i)}>
                <rect
                  x={b.cx - b.barW / 2}
                  y={b.topY}
                  width={b.barW}
                  height={barH}
                  rx={2.5}
                  fill={b.started ? STARTED : BENCHED}
                  opacity={active ? 1 : b.started ? 0.85 : 0.7}
                />
                {showLabel && (
                  <text x={b.cx} y={height - 8} textAnchor="middle" fontSize={9} fill={TEXT_MUTED}>{b.week}</text>
                )}
                <rect x={b.cx - plot.slot / 2} y={M.top} width={plot.slot} height={plot.h} fill="transparent" />
              </g>
            );
          })}
        </svg>
      )}

      {plot && (
        <div className="absolute top-0 right-3 flex items-center gap-3 text-[10px] text-[#75757f]">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: STARTED }} />Started</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BENCHED }} />Benched</span>
        </div>
      )}

      {hover && plot && (
        <div
          className="absolute pointer-events-none bg-[#161616] border border-[#2a2a2a] rounded-lg px-2.5 py-1.5 z-10"
          style={{ left: Math.min(Math.max(hover.cx - 50, 0), width - 116), top: 4 }}
        >
          <div className="text-[10px] text-[#888888] mb-0.5">Week {hover.week}</div>
          <div className="text-[13px] font-bold tabular-nums" style={{ color: hover.started ? STARTED : '#9c9ca7' }}>
            {hover.points.toFixed(1)} pts
          </div>
          <div className="text-[10px] text-[#75757f]">{hover.started ? 'Started' : 'On the bench'}</div>
        </div>
      )}
    </div>
  );
}
