import { Search, ChevronDown } from 'lucide-react';

interface FilterBarProps {
  children: React.ReactNode;
  sticky?: boolean;
}

/**
 * Filter row layout. Children flex-wrap, so a full-width SearchInput takes its
 * own line while FilterPills (which scroll) and a SortSelect share the next.
 */
export function FilterBar({ children, sticky = false }: FilterBarProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 mb-4 ${
        sticky
          ? 'sticky top-0 z-10 -mx-1 px-1 py-2 bg-[#0d0d11]/85 backdrop-blur-xl'
          : ''
      }`}
    >
      {children}
    </div>
  );
}

// Sub-components for consistent filter elements

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Search...' }: SearchInputProps) {
  return (
    <div className="relative w-full">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#75757f] pointer-events-none" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-11 pl-10 pr-3 bg-[#141419] border border-[#22222b] rounded-xl text-sm text-white placeholder-[#60606a] focus:outline-none focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/20 transition-all"
      />
    </div>
  );
}

interface FilterPillsProps {
  options: { value: string; label: string }[];
  selected: string;
  onChange: (value: string) => void;
}

export function FilterPills({ options, selected, onChange }: FilterPillsProps) {
  return (
    // A horizontal rail: on narrow screens pills scroll instead of wrapping,
    // so the control stays a single tidy line. Fades at the right edge to hint
    // there's more to scroll.
    <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar scroll-fade-x -my-1 py-1">
      <div className="flex items-center gap-1.5 w-max">
        {options.map(({ value, label }) => {
          const active = selected === value;
          return (
            <button
              key={value}
              onClick={() => onChange(value)}
              className={`h-9 px-3.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-all ${
                active
                  ? 'bg-accent-500 text-white shadow-[0_0_10px_rgba(34,197,94,0.25)]'
                  : 'bg-[#141419] border border-[#22222b] text-[#9c9ca7] hover:text-white hover:border-[#363641]'
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

interface SortSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

export function SortSelect({ value, onChange, options }: SortSelectProps) {
  return (
    // Native <select> for accessibility + the OS picker on mobile, but styled to
    // match the pills: fixed height, custom chevron, no default browser chrome.
    <div className="relative shrink-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Sort"
        className="h-9 pl-3.5 pr-9 bg-[#141419] border border-[#22222b] rounded-lg text-[13px] font-medium text-white appearance-none cursor-pointer focus:outline-none focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/20 hover:border-[#363641] transition-all"
      >
        {options.map(({ value: v, label }) => (
          <option key={v} value={v}>{label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#75757f] pointer-events-none" />
    </div>
  );
}
