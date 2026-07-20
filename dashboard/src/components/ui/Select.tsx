import { ChevronDown, ArrowUpDown } from 'lucide-react';

// ── Select ────────────────────────────────────────────────────────────────
// The one styled native <select> (sort controls, small dropdowns). Native for
// accessibility + the OS picker on mobile, chromed to match the pills: slim
// 36px height, one border, radius, custom chevron.
//
// `compact` renders an icon-only square (a sort glyph) with the native select
// invisibly overlaid — same a11y + native picker, a fraction of the width — so
// a filter row can keep search and sort on one line.

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  ariaLabel?: string;
  /** Icon-only square trigger (native select overlaid) to save horizontal room. */
  compact?: boolean;
}

export function Select({ value, onChange, options, ariaLabel = 'Select', compact = false }: SelectProps) {
  if (compact) {
    return (
      <div className="relative shrink-0 h-9 w-9">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        >
          {options.map(({ value: v, label }) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <div className="pointer-events-none h-9 w-9 flex items-center justify-center bg-surface border border-line rounded-lg text-muted">
          <ArrowUpDown className="w-4 h-4" />
        </div>
      </div>
    );
  }
  return (
    <div className="relative shrink-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="h-9 pl-3 pr-8 bg-surface border border-line rounded-lg text-[13px] font-medium text-white appearance-none cursor-pointer focus:outline-none focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/20 hover:border-line-strong transition-colors"
      >
        {options.map(({ value: v, label }) => (
          <option key={v} value={v}>{label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
    </div>
  );
}
