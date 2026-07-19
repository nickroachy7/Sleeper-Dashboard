import { useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';

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
        className="flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-lg border border-[#2a2a34] text-[12px] font-semibold text-[#c4c4cd] hover:bg-[#1b1b22] transition-colors max-w-[52vw] sm:max-w-none"
      >
        <span className="truncate">{label}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-[#60606a] shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-[90] w-60 rounded-xl bg-[#141419] border border-[#2a2a34] shadow-2xl overflow-hidden py-1">
            {allLabel && (
              <button
                role="menuitem"
                onClick={() => { onSelect(null); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#1b1b22] transition-colors"
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${selected === null ? 'bg-accent-500' : 'bg-[#3a3a44]'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-white truncate">{allLabel}</p>
                  <p className="text-[11px] text-[#75757f]">Global community values</p>
                </div>
              </button>
            )}
            {leagues.map((l) => (
              <button
                key={l.rootLeagueId}
                role="menuitem"
                onClick={() => { onSelect(l.rootLeagueId); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#1b1b22] transition-colors"
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${l.rootLeagueId === selected ? 'bg-accent-500' : 'bg-[#3a3a44]'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-white truncate">{l.name}</p>
                  <p className="text-[11px] text-[#75757f]">{l.season} Season</p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
