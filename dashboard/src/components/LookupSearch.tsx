import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users, X } from 'lucide-react';
import { usePlayers, usePlayerValuesList } from '../hooks/queries';
import { useLeagueDirectory } from '../hooks/detail';
import { PositionBadge } from './PositionBadge';
import { getPlayerImageUrl } from '../lib/trade-shared';
import { OPEN_LOOKUP_EVENT } from '../lib/lookup';

interface Result {
  kind: 'player' | 'team';
  id: string;
  to: string;
  title: string;
  subtitle: string;
  position?: string;
  value?: number;
}

/**
 * Global player/team lookup palette. Opens via Cmd/Ctrl+K, "/", or the
 * OPEN_LOOKUP_EVENT dispatched by the top bar / mobile search button.
 */
export function LookupSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { data: players } = usePlayers();
  const { data: playerValues } = usePlayerValuesList();
  const { data: directory } = useLeagueDirectory();

  // Open/close hotkeys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_LOOKUP_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_LOOKUP_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  // Reset search state when the palette closes (adjust-during-render pattern)
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) { setQuery(''); setActiveIdx(0); }
  }

  const results = useMemo((): Result[] => {
    const q = query.trim().toLowerCase();
    const out: Result[] = [];

    // Teams (current league)
    if (directory) {
      const teams = directory.rosters
        .filter((r) => r.league_id === directory.currentLeagueId)
        .map((r) => {
          const name = directory.teamName(r.roster_id);
          const owner = directory.users.find((u) => u.user_id === r.owner_id);
          return { rosterId: r.roster_id, name, ownerName: owner?.display_name || owner?.username || '' };
        })
        .filter((t) => !q || t.name.toLowerCase().includes(q) || t.ownerName.toLowerCase().includes(q));
      teams.slice(0, q ? 4 : 12).forEach((t) => {
        out.push({
          kind: 'team',
          id: `team-${t.rosterId}`,
          to: `/teams/${t.rosterId}`,
          title: t.name,
          subtitle: t.ownerName,
        });
      });
    }

    // Players (only with a query — the unfiltered list is noise)
    if (q && players) {
      const matched = players
        .filter((p) => p.full_name?.toLowerCase().includes(q))
        .map((p) => ({ ...p, value: playerValues?.get(p.player_id) || 0 }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
      matched.forEach((p) => {
        out.push({
          kind: 'player',
          id: `player-${p.player_id}`,
          to: `/players/${p.player_id}`,
          title: p.full_name,
          subtitle: [p.position, p.team].filter(Boolean).join(' · '),
          position: p.position,
          value: p.value,
        });
      });
    }

    return out;
  }, [query, players, playerValues, directory]);

  const go = useCallback((r: Result) => {
    setOpen(false);
    navigate(r.to);
  }, [navigate]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg bg-[#141419] border border-[#2a2a34] rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 border-b border-[#1b1b22]">
          <Search className="h-4 w-4 text-[#75757f] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
              if (e.key === 'Enter' && results[activeIdx]) go(results[activeIdx]);
            }}
            placeholder="Search players and teams..."
            className="flex-1 bg-transparent py-3.5 text-sm text-white placeholder-[#75757f] focus:outline-none"
          />
          <button onClick={() => setOpen(false)} className="text-[#75757f] hover:text-white" aria-label="Close search">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {results.length === 0 && (
            <p className="px-4 py-6 text-center text-[11px] text-[#75757f]">
              {query ? 'No matches.' : 'Type to search players, or pick a team.'}
            </p>
          )}
          {results.map((r, i) => (
            <button
              key={r.id}
              onClick={() => go(r)}
              onPointerEnter={() => setActiveIdx(i)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                i === activeIdx ? 'bg-[#1b1b22]' : ''
              }`}
            >
              {r.kind === 'player' ? (
                <img
                  src={getPlayerImageUrl(r.id.replace('player-', ''))}
                  alt=""
                  className="w-8 h-8 rounded-full bg-[#22222b] object-cover shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#22222b] flex items-center justify-center shrink-0">
                  <Users className="h-3.5 w-3.5 text-[#75757f]" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-white truncate">{r.title}</p>
                <p className="text-[10px] text-[#9c9ca7] truncate">{r.subtitle}</p>
              </div>
              {r.kind === 'player' && r.position && <PositionBadge position={r.position} />}
              {r.kind === 'player' && r.value ? (
                <span className="text-[11px] text-[#9c9ca7] tabular-nums shrink-0">{r.value.toLocaleString()}</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-[#1b1b22] flex items-center gap-3 text-[9px] text-[#60606a]">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
          <span className="ml-auto">⌘K anywhere</span>
        </div>
      </div>
    </div>
  );
}
