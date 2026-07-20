import { useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { LeagueMenuItem } from './LeagueMenuItem';

// ── Local league picker ───────────────────────────────────────────
// A dropdown that mirrors the LeagueSwitcher look but writes to LOCAL tab/page
// state, not the app-wide active league — the app chrome stays league-neutral.
// Optionally leads with an "All" entry (value = null) for surfaces that mix a
// global view with a per-league filter (e.g. the Ranking list). Shared by the
// Records tab and the Players ranking filter.

export interface PickerLeague {
  rootLeagueId: string;
  name: string;
  season: string;
}

export function LeaguePicker({
  leagues,
  selected,
  onSelect,
  allLabel,
}: {
  leagues: PickerLeague[];
  /** Selected root id, or null for the "All" entry. */
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** When set, an "All" option (value null) leads the menu — e.g. "All leagues". */
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = leagues.find((l) => l.rootLeagueId === selected);
  const label = selected === null && allLabel ? allLabel : current?.name ?? 'Select league';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-lg border border-line-strong text-[12px] font-semibold text-ink-soft hover:bg-elevated transition-colors max-w-[52vw] sm:max-w-none"
      >
        <span className="truncate">{label}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-ghost shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-[90] w-60 rounded-xl bg-surface border border-line-strong shadow-2xl overflow-hidden py-1">
            {allLabel && (
              <LeagueMenuItem
                name={allLabel}
                sub="Global community values"
                active={selected === null}
                onClick={() => { onSelect(null); setOpen(false); }}
              />
            )}
            {leagues.map((l) => (
              <LeagueMenuItem
                key={l.rootLeagueId}
                name={l.name}
                sub={`${l.season} Season`}
                active={l.rootLeagueId === selected}
                onClick={() => { onSelect(l.rootLeagueId); setOpen(false); }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
