import { ChevronDown } from 'lucide-react';
import { DEBATES } from '../lib/debates/catalog';

// ── RankingSwitcher ──────────────────────────────────────────────────────────
// The "Viewing: ___" control at the top of the Rankings page. One place to reach
// EVERY community ranking: the dynasty board (Players, Picks) and every debate
// leaderboard from The Room, grouped so the list stays legible as debates grow.
//
// Native <select> + <optgroup> — accessible, keyboard-friendly, and it gets the
// OS picker on mobile — chromed to match the app's controls. The value is a
// stable key: 'players' | 'picks' | 'debate:<slug>'.

export type RankingKey = string; // 'players' | 'picks' | `debate:${slug}`

export function rankingLabel(key: RankingKey): string {
  if (key === 'players') return 'Dynasty Players';
  if (key === 'picks') return 'Rookie Picks';
  const slug = key.startsWith('debate:') ? key.slice(7) : '';
  return DEBATES.find((d) => d.slug === slug)?.question ?? 'Ranking';
}

export function RankingSwitcher({
  value,
  onChange,
}: {
  value: RankingKey;
  onChange: (key: RankingKey) => void;
}) {
  return (
    <label className="group relative flex items-center gap-2.5 h-11 pl-3.5 pr-3 rounded-xl bg-surface border border-line hover:border-line-strong focus-within:border-accent-500/60 focus-within:ring-2 focus-within:ring-accent-500/20 transition-colors cursor-pointer w-full sm:w-auto sm:min-w-[280px]">
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint shrink-0">Viewing</span>
      <span className="min-w-0 flex-1 truncate font-display font-semibold text-[15px] text-white">
        {rankingLabel(value)}
      </span>
      <ChevronDown className="h-4 w-4 text-muted shrink-0 group-hover:text-white transition-colors" />
      {/* Native select overlays the whole control (invisible) for a11y + the
          mobile OS picker; the styled row above is what the user sees. */}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Choose which ranking to view"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        <optgroup label="Dynasty">
          <option value="players">Dynasty Players</option>
          <option value="picks">Rookie Picks</option>
        </optgroup>
        <optgroup label="The Room — debates">
          {DEBATES.map((d) => (
            <option key={d.slug} value={`debate:${d.slug}`}>
              {d.question}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}
