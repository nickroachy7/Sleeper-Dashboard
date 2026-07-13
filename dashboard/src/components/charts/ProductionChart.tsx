import { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { CHART_GRID as GRID, CHART_TEXT_MUTED as TEXT_MUTED } from './theme';
import type { PlayerSeasonFact } from '../../hooks/detail';

interface ProductionChartProps {
  data: PlayerSeasonFact[];
  height?: number;
}

const M = { top: 16, right: 14, bottom: 34, left: 30 };
const BAR = '#22c55e'; // fantasy PPG — matches the brand accent green

/**
 * Fantasy points-per-game by NFL season — the player's real production arc.
 * Bar height is PPG (PPR); the bottom axis carries the season and the games
 * played that year, so a short bar from an injury-shortened season reads
 * differently than a genuine down year. Hover surfaces the full line.
 */
export function ProductionChart({ data, height = 200 }: ProductionChartProps) {
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
    const maxPpg = Math.max(...data.map((d) => d.fantasy_ppg ?? 0), 10);
    // Round the axis top up to a clean multiple of 5.
    const top = Math.ceil(maxPpg / 5) * 5;

    const n = data.length;
    // Slot width per season; bars sit centered in each slot with padding.
    const slot = w / n;
    const barW = Math.min(slot * 0.6, 46);
    const x = (i: number) => M.left + i * slot + slot / 2;
    const y = (ppg: number) => M.top + h - (ppg / top) * h;

    const bars = data.map((d, i) => {
      const ppg = d.fantasy_ppg ?? 0;
      return { ...d, cx: x(i), barW, topY: y(ppg), baseY: M.top + h };
    });

    // Y gridlines at 0, mid, top.
    const ticks = [0, top / 2, top].map((v) => ({ v, py: y(v) }));
    return { w, h, bars, ticks };
  }, [data, width, height]);

  const hover = hoverIdx !== null && plot ? plot.bars[hoverIdx] : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ height }}
      role="img"
      aria-label="Fantasy points per game by season"
    >
      {data.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[#555555]">
          No NFL production on record yet.
        </div>
      )}
      {plot && (
        <svg width={width} height={height} className="block" onPointerLeave={() => setHoverIdx(null)}>
          {plot.ticks.map(({ v, py }) => (
            <g key={v}>
              <line x1={M.left} x2={width - M.right} y1={py} y2={py} stroke={GRID} strokeWidth={1} />
              <text x={M.left - 6} y={py + 3} textAnchor="end" fontSize={10} fill={TEXT_MUTED}>
                {Math.round(v)}
              </text>
            </g>
          ))}

          {plot.bars.map((b, i) => {
            const active = hoverIdx === i;
            const barH = Math.max(b.baseY - b.topY, 0);
            return (
              <g key={b.season} onPointerEnter={() => setHoverIdx(i)}>
                <rect
                  x={b.cx - b.barW / 2}
                  y={b.topY}
                  width={b.barW}
                  height={barH}
                  rx={3}
                  fill={BAR}
                  opacity={active ? 1 : 0.82}
                />
                {/* Season + games label under each bar */}
                <text x={b.cx} y={height - 18} textAnchor="middle" fontSize={10} fill={TEXT_MUTED}>
                  {b.season}
                </text>
                <text x={b.cx} y={height - 6} textAnchor="middle" fontSize={9} fill="#3f3f46">
                  {b.games != null ? `${b.games}g` : ''}
                </text>
                {/* Wide hover target */}
                <rect x={b.cx - plot.w / plot.bars.length / 2} y={M.top} width={plot.w / plot.bars.length} height={plot.h} fill="transparent" />
              </g>
            );
          })}
        </svg>
      )}

      {hover && plot && (
        <div
          className="absolute pointer-events-none bg-[#161616] border border-[#2a2a2a] rounded-lg px-2.5 py-1.5 z-10"
          style={{ left: Math.min(Math.max(hover.cx - 60, 0), width - 132), top: 4 }}
        >
          <div className="text-[10px] text-[#888888] mb-0.5">
            {hover.season}{hover.age != null ? ` · age ${Math.round(hover.age)}` : ''}
          </div>
          <div className="text-[13px] font-bold tabular-nums" style={{ color: BAR }}>
            {(hover.fantasy_ppg ?? 0).toFixed(1)} PPG
          </div>
          <div className="text-[10px] text-[#9c9ca7] tabular-nums">
            {(hover.fantasy_total ?? 0).toFixed(0)} pts · {hover.games ?? 0} games
          </div>
        </div>
      )}
    </div>
  );
}
