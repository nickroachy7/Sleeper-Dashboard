import type { ReactNode } from 'react';

interface StatTileProps {
  label: string;
  children: ReactNode;
  /** Secondary text shown inline after the value, muted (e.g. a season or rank). */
  sub?: ReactNode;
  /** Node rendered below the value (e.g. a confidence badge). */
  foot?: ReactNode;
  /** Tooltip; when set, appends an ⓘ and a help cursor. */
  hint?: string;
  /** Override the value color/emphasis (defaults to white). */
  valueClassName?: string;
  className?: string;
}

/**
 * The canonical dashboard stat tile — one label + one big value, used across
 * player and team pages so every metric reads the same. Value color and inline
 * sub-text are the only per-use variation.
 */
export function StatTile({ label, children, sub, foot, hint, valueClassName, className }: StatTileProps) {
  return (
    <div
      className={`rounded-xl border border-[#22222b] bg-[#101015]/60 px-3 py-1.5 ${hint ? 'cursor-help' : ''} ${className ?? ''}`}
      title={hint}
    >
      <p className="text-[9px] text-[#75757f] uppercase tracking-[0.08em] font-bold truncate">
        {label}{hint ? ' ⓘ' : ''}
      </p>
      <p className={`font-display text-xl font-bold tabular-nums ${valueClassName ?? 'text-white'}`}>
        {children}
        {sub != null && <span className="text-[11px] text-[#75757f] ml-1.5 font-sans font-semibold">{sub}</span>}
      </p>
      {foot != null && <div className="mt-0.5">{foot}</div>}
    </div>
  );
}
