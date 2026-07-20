import type { ReactNode } from 'react';
import { SearchInput as UISearchInput } from './ui/SearchInput';
import { Segmented } from './ui/Segmented';
import { Select } from './ui/Select';

// ── FilterBar ────────────────────────────────────────────────────────────────
// Adaptive filter row that stays as compact as the controls allow: one slim
// line when it fits, a second line only when it must.
//
// Slots: `search` (grows), `sort` (compact, trailing), `filters` (the pill rail
// + any inline toggles). Layout rule:
//   - With a search box: line 1 = search + sort (sort stays a compact square so
//     it never pushes search off-screen); line 2 = the filter rail (own line so
//     a long "All / QB / RB / WR / TE" set scrolls instead of clipping).
//   - Without a search box: everything sits on ONE line (filters grow, sort
//     trails) — e.g. Transactions is a single slim row.
// Callers pass the shared primitives into the slots; the legacy SearchInput /
// FilterPills / SortSelect adapters below keep older call sites working.

interface FilterBarProps {
  search?: ReactNode;
  filters?: ReactNode;
  sort?: ReactNode;
  /** Compact trailing controls beside search (e.g. a FilterSheet ⚙ + sort). */
  trailing?: ReactNode;
  sticky?: boolean;
  /** Legacy: free-form children (old call sites). Rendered as a wrapping row. */
  children?: ReactNode;
}

export function FilterBar({ search, filters, sort, trailing, sticky = false, children }: FilterBarProps) {
  const stickyCls = sticky ? 'sticky top-0 z-10 -mx-1 px-1 py-2 bg-base/85 backdrop-blur-xl' : '';

  // Legacy free-form mode.
  if (children) {
    return <div className={`flex flex-wrap items-center gap-2 mb-3 ${stickyCls}`}>{children}</div>;
  }

  return (
    <div className={`mb-3 ${stickyCls}`}>
      {search ? (
        <>
          {/* Line 1: search grows; compact controls (filter sheet, sort) trail. */}
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">{search}</div>
            {trailing}
            {sort}
          </div>
          {/* Optional line 2: a visible filter rail (only if `filters` is used). */}
          {filters && <div className="flex items-center gap-2 mt-2">{filters}</div>}
        </>
      ) : (
        // No search → one line: filters grow, trailing + sort follow.
        <div className="flex items-center gap-2">
          {filters && <div className="flex-1 min-w-0">{filters}</div>}
          {trailing}
          {sort}
        </div>
      )}
    </div>
  );
}

// ── Backwards-compatible adapters over the shared primitives ─────────────────

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchInput({ value, onChange, placeholder }: SearchInputProps) {
  return <UISearchInput value={value} onChange={onChange} placeholder={placeholder} />;
}

interface FilterPillsProps {
  options: { value: string; label: string }[];
  selected: string;
  onChange: (value: string) => void;
}

export function FilterPills({ options, selected, onChange }: FilterPillsProps) {
  return <Segmented options={options} value={selected} onChange={onChange} />;
}

interface SortSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  /** Icon-only compact trigger to keep a filter row on one line. */
  compact?: boolean;
}

export function SortSelect({ value, onChange, options, compact }: SortSelectProps) {
  return <Select value={value} onChange={onChange} options={options} ariaLabel="Sort" compact={compact} />;
}
