import type { ReactNode } from 'react';

interface StatProps {
  label: string;
  children: ReactNode;
  /** Secondary text shown inline after the value, muted (e.g. a season or rank). */
  sub?: ReactNode;
  /** Tooltip; when set, appends an ⓘ and a help cursor. */
  hint?: string;
}

/**
 * A single label + value pair inside a StatStrip. Unboxed sibling of StatTile:
 * same type treatment, no border/background, for stats that live inside a
 * SectionCard where nested boxes would read as clutter.
 */
export function Stat({ label, children, sub, hint }: StatProps) {
  return (
    <div className={hint ? 'cursor-help' : ''} title={hint}>
      <p className="text-[9px] text-[#75757f] uppercase tracking-[0.08em] font-bold whitespace-nowrap">
        {label}{hint ? ' ⓘ' : ''}
      </p>
      <p className="font-display text-lg font-bold tabular-nums text-white leading-tight">
        {children}
        {sub != null && <span className="text-[11px] text-[#75757f] ml-1.5 font-sans font-semibold">{sub}</span>}
      </p>
    </div>
  );
}

/**
 * Row of Stats. On narrow screens they snap to a 3-column grid so a wrapped
 * second row aligns with the first instead of floating ragged; from `sm` up
 * they sit on one evenly-spread line.
 */
export function StatStrip({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-3 sm:flex sm:items-end sm:justify-between sm:gap-x-6">
      {children}
    </div>
  );
}
