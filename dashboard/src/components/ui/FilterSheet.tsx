import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal, X } from 'lucide-react';

// ── FilterSheet ──────────────────────────────────────────────────────────────
// A compact filter affordance: a slim square trigger (sliders icon) that sits
// beside the search box and opens a panel holding the secondary controls
// (position filter, league switcher, toggles). Keeps the filter ROW to a single
// slim line — everything beyond search + sort lives in here.
//
// Mobile: slides up as a bottom sheet (thumb-reachable). Desktop (sm+): a
// right-anchored popover under the trigger. A badge on the trigger shows how
// many filters are active so it's obvious something's applied without opening.

interface FilterSheetProps {
  /** Count of active (non-default) filters — shows as a badge; 0 hides it. */
  activeCount?: number;
  /** Sheet title. */
  title?: string;
  children: ReactNode;
}

export function FilterSheet({ activeCount = 0, title = 'Filters', children }: FilterSheetProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${title}${activeCount ? ` (${activeCount} active)` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`relative shrink-0 h-9 w-9 flex items-center justify-center rounded-lg border transition-colors ${
          activeCount
            ? 'bg-accent-500/15 border-accent-500/40 text-accent-300'
            : 'bg-surface border-line text-muted hover:text-white hover:border-line-strong'
        }`}
      >
        <SlidersHorizontal className="w-4 h-4" />
        {activeCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-accent-500 text-[10px] font-bold text-[#06110a] tabular-nums">
            {activeCount}
          </span>
        )}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[75]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-menu-fade" onClick={() => setOpen(false)} />
          {/* Mobile: bottom sheet. sm+: right-anchored panel near the top. */}
          <div
            role="dialog"
            aria-label={title}
            className="absolute inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-24 sm:w-80
                       rounded-t-2xl sm:rounded-2xl border border-line bg-surface shadow-2xl
                       pb-[env(safe-area-inset-bottom)] animate-menu-drop"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-line-subtle">
              <span className="text-[13px] font-bold text-white tracking-wide">{title}</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close filters"
                className="w-8 h-8 -mr-1.5 flex items-center justify-center rounded-lg text-faint hover:text-white hover:bg-elevated transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">{children}</div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/** A labeled group inside a FilterSheet — a small caption over its control. */
export function FilterSheetGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-faint tracking-[0.14em] uppercase mb-2">{label}</p>
      {children}
    </div>
  );
}
