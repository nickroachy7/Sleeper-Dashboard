import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronsUpDown, Check, Plus, Settings, MessageSquarePlus } from 'lucide-react';
import { useLeague } from '../hooks/queries';
import { useActiveLeague } from '../lib/active-league';
import { openAddLeague } from '../lib/add-league-modal';

function statusDot(status?: string) {
  if (status === 'in_season' || status === 'drafting') return 'bg-emerald-500';
  if (status === 'complete') return 'bg-[#75757f]';
  return 'bg-amber-500';
}

/**
 * League identity + switcher. Shows the active league and, on click, a menu of
 * the visitor's added leagues plus actions to add or manage them. Replaces the
 * static league block in the sidebar and mobile drawer.
 *
 * `compact` renders just a circular avatar trigger (league initial + status
 * dot) with a right-anchored menu — used in the mobile header so it can sit
 * beside a centered logo without stealing width.
 */
export function LeagueSwitcher({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const navigate = useNavigate();
  const { data: active } = useLeague();
  const { leagues, activeLeagueId, hasLeague, isPreview, setActiveLeague } = useActiveLeague();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  // The active league_id we highlight: explicit choice, else the resolved
  // current league (the DB-default demo when nothing is chosen).
  const activeRootId = activeLeagueId ?? active?.league_id ?? null;

  const name = active?.name ?? (hasLeague ? 'Loading…' : 'No league');
  const season = active?.season;
  const teams = active?.total_rosters;

  const choose = (rootLeagueId: string) => {
    setActiveLeague(rootLeagueId);
    setOpen(false);
    onNavigate?.();
  };

  // Fresh visitor with no league: the switcher is a direct "Add a league" CTA.
  if (!hasLeague) {
    if (compact) {
      return (
        <button
          onClick={() => { onNavigate?.(); openAddLeague(); }}
          aria-label="Add a league"
          className="w-9 h-9 rounded-full bg-accent-500/15 flex items-center justify-center shrink-0 active:bg-accent-500/25 transition-colors"
        >
          <Plus className="h-[18px] w-[18px] text-accent-400" />
        </button>
      );
    }
    return (
      <button
        onClick={() => { onNavigate?.(); openAddLeague(); }}
        className="w-full flex items-center gap-2.5 text-left group"
      >
        <span className="w-8 h-8 rounded-lg bg-accent-500/15 flex items-center justify-center shrink-0">
          <Plus className="h-4 w-4 text-accent-400" />
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-semibold text-white">Add a league</span>
          <p className="text-[11px] text-[#75757f]">Connect your Sleeper league</p>
        </div>
      </button>
    );
  }

  const initial = (name.trim()[0] || '?').toUpperCase();

  return (
    <div className="relative" ref={ref}>
      {compact ? (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`League: ${name}. Switch league`}
          className="relative w-9 h-9 rounded-full bg-[#1b1b22] border border-[#2a2a34] flex items-center justify-center shrink-0 active:bg-[#22222b] transition-colors"
        >
          <span className="text-[13px] font-bold text-white leading-none">{initial}</span>
          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0d0d11] ${statusDot(active?.status)}`} />
        </button>
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center gap-2 text-left group"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot(active?.status)}`} />
              <span className="text-[13px] font-semibold text-white truncate">{name}</span>
              {isPreview && (
                <span className="text-[9px] uppercase tracking-wide font-bold text-accent-400 bg-accent-500/15 px-1.5 py-0.5 rounded shrink-0">
                  Sample
                </span>
              )}
            </div>
            {season && (
              <p className="text-[11px] text-[#75757f] pl-4">
                {season} Season{teams ? ` · ${teams} Teams` : ''}
              </p>
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 text-[#60606a] group-hover:text-[#9c9ca7] shrink-0" />
        </button>
      )}

      {open && (
        <div
          role="menu"
          className={`absolute top-[calc(100%+8px)] z-[90] rounded-xl bg-[#141419] border border-[#2a2a34] shadow-2xl overflow-hidden py-1 ${
            compact ? 'right-0 w-64' : 'left-0 right-0'
          }`}
        >
          {leagues.length > 0 ? (
            <div className="max-h-[45vh] overflow-y-auto py-1">
              {leagues.map((l) => {
                const isActive = l.rootLeagueId === activeRootId;
                return (
                  <button
                    key={l.rootLeagueId}
                    role="menuitem"
                    onClick={() => choose(l.rootLeagueId)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#1b1b22] transition-colors"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-accent-500' : 'bg-[#3a3a44]'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-white truncate">{l.name}</p>
                      <p className="text-[11px] text-[#75757f]">{l.season} Season</p>
                    </div>
                    {isActive && <Check className="h-4 w-4 text-accent-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="px-3 py-2.5 text-[12px] text-[#75757f]">No leagues added yet.</p>
          )}

          <div className="border-t border-[#22222b] mt-1 pt-1">
            <button
              role="menuitem"
              onClick={() => { setOpen(false); openAddLeague(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] text-accent-400 hover:bg-[#1b1b22] transition-colors font-medium"
            >
              <Plus className="h-4 w-4" /> Add a league
            </button>
            <button
              role="menuitem"
              onClick={() => { setOpen(false); onNavigate?.(); navigate('/settings'); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] text-[#9c9ca7] hover:bg-[#1b1b22] transition-colors"
            >
              <Settings className="h-4 w-4" /> Settings
            </button>
            <button
              role="menuitem"
              onClick={() => { setOpen(false); onNavigate?.(); navigate('/feedback'); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] text-[#9c9ca7] hover:bg-[#1b1b22] transition-colors"
            >
              <MessageSquarePlus className="h-4 w-4" /> Feedback
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
