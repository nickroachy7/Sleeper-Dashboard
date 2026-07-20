// ── Segmented (pills) ────────────────────────────────────────────────────────
// The one "pick one (or more) of N" pill control. Folds together the 5+ drifted
// stylings — position filters, year pills, tab-style pills, TradeFinder groups.
// Soft-tint active treatment (translucent accent fill + accent text), one
// radius, canonical height. On narrow screens the row becomes a horizontal
// scroll rail (no wrap, faded right edge) so it stays a single tidy line.

import type { ReactNode } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Optional per-option accent (e.g. position colors); defaults to the green. */
  activeClassName?: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  /** Single-select: the selected value. */
  value: T;
  onChange: (value: T) => void;
  /** `sm` for dense inline rows (year pills), `md` for primary filters. */
  size?: 'sm' | 'md';
  /**
   * Layout:
   * - 'bar' (default): the primary filter row — full-width on mobile so the
   *   pills own their own scrollable line, flex-1 from sm up.
   * - 'inline': a compact selector (e.g. season pills in a section header) —
   *   natural width, scrolls only if it overflows, never full-width.
   * - 'fill': even-split segmented control across the available width.
   */
  layout?: 'bar' | 'inline' | 'fill';
}

const ACTIVE_DEFAULT = 'bg-accent-500/15 border-accent-500/40 text-accent-300';
const INACTIVE = 'bg-surface border-line text-muted hover:text-white hover:border-line-strong';

export function Segmented<T extends string>({ options, value, onChange, size = 'md', layout = 'bar' }: SegmentedProps<T>) {
  const h = size === 'sm' ? 'h-8' : 'h-9';
  const text = size === 'sm' ? 'text-[12px]' : 'text-[13px]';
  const fill = layout === 'fill';
  const outer =
    layout === 'fill' ? 'flex w-full gap-1.5'
    : layout === 'inline' ? 'max-w-full min-w-0 overflow-x-auto no-scrollbar scroll-fade-x -my-1 py-1'
    : 'w-full sm:flex-1 min-w-0 overflow-x-auto no-scrollbar scroll-fade-x -my-1 py-1';
  return (
    <div className={outer}>
      <div className={`flex items-center gap-1.5 ${fill ? 'w-full' : 'w-max'}`}>
        {options.map(({ value: v, label, activeClassName }) => {
          const active = v === value;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              aria-pressed={active}
              className={`${fill ? 'flex-1' : 'shrink-0'} ${h} px-3 rounded-lg border ${text} font-medium whitespace-nowrap transition-colors ${
                active ? (activeClassName ?? ACTIVE_DEFAULT) : INACTIVE
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
