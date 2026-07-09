import { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { CHART_POS as POS, CHART_NEG as NEG, CHART_SURFACE as SURFACE, CHART_GRID as GRID, CHART_TEXT_MUTED as TEXT_MUTED } from './theme';
import type { SeasonValuePoint } from '../../hooks/detail';

interface SeasonValueChartProps {
  data: SeasonValuePoint[];
  height?: number;
}

const M = { top: 16, right: 16, bottom: 28, left: 46 };
const fmt = (v: number) => Math.round(v).toLocaleString();

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
 * Per-season roster value vs the league average. Each season is a marker (the
 * roster the manager actually held that year, valued at that year's prices),
 * colored green when above the league average that season, red when below. The
 * dashed line is the league average. Unlike a back-projected daily line, this
 * shows real team-building: climbing markers = building value, falling = bleeding.
 */
export function SeasonValueChart({ data, height = 240 }: SeasonValueChartProps) {
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

    const vals = [...data.map((d) => d.value), ...data.map((d) => d.leagueAvg)];
    let vMin = Math.min(...vals), vMax = Math.max(...vals);
    if (vMin === vMax) { vMin -= 1; vMax += 1; }
    const pad = (vMax - vMin) * 0.12;
    vMin -= pad; vMax += pad;

    // Evenly space seasons across the x-axis (categorical, not time-scaled).
    const n = data.length;
    const x = (i: number) => M.left + (n === 1 ? w / 2 : (i / (n - 1)) * w);
    const y = (v: number) => M.top + h - ((v - vMin) / (vMax - vMin)) * h;

    const pts = data.map((d, i) => ({ ...d, px: x(i), py: y(d.value), lgY: y(d.leagueAvg) }));
    const teamLine = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.px},${p.py}`).join('');
    const leagueLine = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.px},${p.lgY}`).join('');

    return {
      w, h, pts, teamLine, leagueLine,
      yTicks: niceTicks(vMin, vMax).map((v) => ({ v, py: y(v) })),
    };
  }, [data, width, height]);

  const hover = hoverIdx !== null && plot ? plot.pts[hoverIdx] : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ height }}
      role="img"
      aria-label="Roster value by season versus league average"
    >
      {data.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[#555555]">
          Not enough season history yet.
        </div>
      )}
      {plot && (
        <svg width={width} height={height} className="block" onPointerLeave={() => setHoverIdx(null)}>
          {plot.yTicks.map(({ v, py }) => (
            <g key={v}>
              <line x1={M.left} x2={width - M.right} y1={py} y2={py} stroke={GRID} strokeWidth={1} />
              <text x={M.left - 8} y={py + 3} textAnchor="end" fontSize={10} fill={TEXT_MUTED} style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(v)}</text>
            </g>
          ))}
          {plot.pts.map((p) => (
            <text key={p.season} x={p.px} y={height - 8} textAnchor="middle" fontSize={10} fill={TEXT_MUTED}>{p.season}</text>
          ))}

          {/* League average (dashed reference) */}
          <path d={plot.leagueLine} fill="none" stroke="#8a8a94" strokeWidth={1.25} strokeDasharray="4 3" opacity={0.7} />

          {/* Team line — neutral connector; markers carry the green/red verdict */}
          <path d={plot.teamLine} fill="none" stroke="#4c4c56" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {/* Season markers + vertical tick to the league line */}
          {plot.pts.map((p, i) => {
            const up = p.vsLeague >= 0;
            const c = up ? POS : NEG;
            return (
              <g key={p.season} onPointerEnter={() => setHoverIdx(i)}>
                <line x1={p.px} x2={p.px} y1={p.py} y2={p.lgY} stroke={c} strokeWidth={1} opacity={0.35} />
                <circle cx={p.px} cy={p.py} r={hoverIdx === i ? 6 : 5} fill={c} stroke={SURFACE} strokeWidth={2} />
                {/* invisible wide hit target */}
                <rect x={p.px - 20} y={M.top} width={40} height={plot.h} fill="transparent" />
              </g>
            );
          })}
        </svg>
      )}

      {/* Legend */}
      {plot && (
        <div className="absolute top-0 right-4 flex items-center gap-3 text-[10px] text-[#75757f]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: POS }} />Above lg</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: NEG }} />Below lg</span>
          <span className="flex items-center gap-1"><span className="w-3 border-t border-dashed border-[#8a8a94]" />League avg</span>
        </div>
      )}

      {hover && plot && (
        <div
          className="absolute pointer-events-none bg-[#161616] border border-[#2a2a2a] rounded-lg px-2.5 py-1.5 z-10"
          style={{ left: Math.min(Math.max(hover.px - 55, 0), width - 130), top: Math.max(hover.py - 62, 0) }}
        >
          <div className="text-[10px] text-[#888888] mb-0.5">{hover.season}</div>
          <div className="text-[13px] font-bold text-white tabular-nums">{fmt(hover.value)}</div>
          <div className="text-[10px] tabular-nums" style={{ color: hover.vsLeague >= 0 ? POS : NEG }}>
            {hover.vsLeague >= 0 ? '+' : ''}{fmt(hover.vsLeague)} vs league
          </div>
        </div>
      )}
    </div>
  );
}
