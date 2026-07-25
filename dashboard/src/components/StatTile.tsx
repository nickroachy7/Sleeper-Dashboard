import type { ReactNode } from 'react';

interface StatTileProps {
  label: string;
  children: ReactNode;
  /** Secondary text shown inline after the value, muted (e.g. a season or rank). */
  sub?: ReactNode;
  /** Node rendered inline to the right of the value (e.g. a confidence badge). */
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
      className={`rounded-xl border border-line bg-base/40 px-3.5 py-2.5 ${hint ? 'cursor-help' : ''} ${className ?? ''}`}
      title={hint}
    >
      <p className="text-[9px] text-faint uppercase tracking-[0.1em] font-bold truncate">
        {label}{hint ? ' ⓘ' : ''}
      </p>
      <div className="flex items-baseline gap-1.5 min-w-0 mt-1">
        <p className={`font-display text-[22px] leading-none font-bold tabular-nums truncate ${valueClassName ?? 'text-white'}`}>
          {children}
          {sub != null && <span className="text-[11px] text-faint ml-1.5 font-sans font-semibold">{sub}</span>}
        </p>
        {foot != null && <div className="shrink-0 self-center">{foot}</div>}
      </div>
    </div>
  );
}
