interface FilterBarProps {
  children: React.ReactNode;
  sticky?: boolean;
}

export function FilterBar({ children, sticky = false }: FilterBarProps) {
  return (
    <div
      className={`flex flex-col sm:flex-row items-start sm:items-center gap-2 py-2 px-1 mb-3 ${
        sticky ? 'sticky top-0 z-10 bg-black/90 backdrop-blur-xl -mx-1 px-1' : ''
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
    <div className="relative flex-1 w-full sm:w-auto">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#75757f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-9 pr-3 py-2 bg-[#141419] border border-[#2a2a34] rounded-lg text-sm text-white placeholder-[#60606a] focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-transparent transition-all"
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
    <div className="flex gap-1 flex-wrap">
      {options.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            selected === value
              ? 'bg-accent-500 text-white shadow-[0_0_8px_rgba(34,197,94,0.2)]'
              : 'bg-[#1b1b22] text-[#9c9ca7] hover:bg-[#26262f] hover:text-white'
          }`}
        >
          {label}
        </button>
      ))}
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
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 bg-[#141419] border border-[#2a2a34] rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent-500/50 text-white cursor-pointer"
    >
      {options.map(({ value: v, label }) => (
        <option key={v} value={v}>{label}</option>
      ))}
    </select>
  );
}
