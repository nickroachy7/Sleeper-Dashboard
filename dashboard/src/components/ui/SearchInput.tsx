import { Search, X } from 'lucide-react';

// ── SearchInput ─────────────────────────────────────────────────────────────
// The one text-search box. Replaces six drifted treatments (different heights,
// borders, radii). Compact by default: a slim 36px control so a filter row
// stays tight on mobile, one border/radius, leading search icon, optional
// clear button. Still a comfortable tap target (36px + full-width hit area).

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Show an inline clear (✕) button when there's text. Default true. */
  clearable?: boolean;
  autoFocus?: boolean;
}

export function SearchInput({ value, onChange, placeholder = 'Search…', clearable = true, autoFocus }: SearchInputProps) {
  return (
    <div className="relative w-full">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
      <input
        type="text"
        inputMode="search"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 pl-9 pr-8 bg-surface border border-line rounded-lg text-[13px] text-white placeholder-ghost focus:outline-none focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/20 transition-colors"
      />
      {clearable && value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-faint hover:text-white hover:bg-elevated transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
