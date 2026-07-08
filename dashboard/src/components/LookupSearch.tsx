import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { usePlayers, usePlayerValuesList } from '../hooks/queries';
import { useLeagueDirectory } from '../hooks/detail';
import { PlayerRow } from './PlayerRow';
import { TeamRow } from './TeamRow';
import { OPEN_LOOKUP_EVENT } from '../lib/lookup';

interface PlayerResult {
  kind: 'player';
  id: string;
  to: string;
  playerId: string;
  name: string;
  position?: string;
  team?: string | null;
  value?: number;
}

interface TeamResult {
  kind: 'team';
  id: string;
  to: string;
  rosterId: number;
  name: string;
  owner: string;
  avatarId?: string | null;
}

type Result = PlayerResult | TeamResult;

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

  const { teams, playerResults } = useMemo(() => {
    const q = query.trim().toLowerCase();

    // Teams (current league)
    let teams: TeamResult[] = [];
    if (directory) {
      teams = directory.rosters
        .filter((r) => r.league_id === directory.currentLeagueId)
        .map((r) => {
          const name = directory.teamName(r.roster_id);
          const owner = directory.users.find((u) => u.user_id === r.owner_id);
          return {
            kind: 'team' as const,
            id: `team-${r.roster_id}`,
            to: `/teams/${r.roster_id}`,
            rosterId: r.roster_id,
            name,
            owner: owner?.display_name || owner?.username || '',
            avatarId: (owner as { avatar?: string | null })?.avatar ?? null,
          };
        })
        .filter((t) => !q || t.name.toLowerCase().includes(q) || t.owner.toLowerCase().includes(q))
        .slice(0, q ? 4 : 12);
    }

    // Players (only with a query — the unfiltered list is noise)
    let playerResults: PlayerResult[] = [];
    if (q && players) {
      playerResults = players
        .filter((p) => p.full_name?.toLowerCase().includes(q))
        .map((p) => ({ p, value: playerValues?.get(p.player_id) || 0 }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)
        .map(({ p, value }) => ({
          kind: 'player' as const,
          id: `player-${p.player_id}`,
          to: `/players/${p.player_id}`,
          playerId: p.player_id,
          name: p.full_name,
          position: p.position,
          team: p.team,
          value,
        }));
    }

    return { teams, playerResults };
  }, [query, players, playerValues, directory]);

  // Flat, ordered list drives keyboard navigation. Players first when present.
  const flat = useMemo<Result[]>(() => [...playerResults, ...teams], [playerResults, teams]);

  const go = useCallback((r: Result | undefined) => {
    if (!r) return;
    setOpen(false);
    navigate(r.to);
  }, [navigate]);

  if (!open) return null;

  const idxOf = (r: Result) => flat.indexOf(r);
  const activeClass = (r: Result) => (idxOf(r) === activeIdx ? 'bg-[#1b1b22]' : '');

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-[#141419] border border-[#2a2a34] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-[#22222b]">
          <Search className="h-4 w-4 text-[#75757f] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, flat.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
              if (e.key === 'Enter') { e.preventDefault(); go(flat[activeIdx]); }
            }}
            placeholder="Search players and teams…"
            className="flex-1 bg-transparent py-4 text-[15px] text-white placeholder-[#75757f] focus:outline-none"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="text-[#60606a] hover:text-white transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[54vh] overflow-y-auto py-1.5">
          {flat.length === 0 ? (
            <p className="px-4 py-10 text-center text-[12px] text-[#75757f]">
              {query ? (
                <>No matches for “<span className="text-[#d6d6de]">{query}</span>”.</>
              ) : (
                'Type to search players, or jump to a team below.'
              )}
            </p>
          ) : (
            <>
              {playerResults.length > 0 && (
                <div className="mb-1">
                  <p className="px-4 pt-1.5 pb-1 text-[10px] font-bold tracking-[0.18em] uppercase text-[#60606a]">
                    Players
                  </p>
                  {playerResults.map((r) => (
                    <div key={r.id} onPointerEnter={() => setActiveIdx(idxOf(r))}>
                      <PlayerRow
                        playerId={r.playerId}
                        name={r.name}
                        position={r.position}
                        team={r.team}
                        value={r.value}
                        size="sm"
                        onClick={() => setOpen(false)}
                        className={activeClass(r)}
                      />
                    </div>
                  ))}
                </div>
              )}

              {teams.length > 0 && (
                <div>
                  <p className="px-4 pt-1.5 pb-1 text-[10px] font-bold tracking-[0.18em] uppercase text-[#60606a]">
                    {query ? 'Teams' : 'League Teams'}
                  </p>
                  {teams.map((r) => (
                    <div key={r.id} onPointerEnter={() => setActiveIdx(idxOf(r))}>
                      <TeamRow
                        rosterId={r.rosterId}
                        name={r.name}
                        subtitle={r.owner}
                        avatarId={r.avatarId}
                        size="sm"
                        onClick={() => setOpen(false)}
                        className={activeClass(r)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer hints */}
        <div className="px-4 py-2.5 border-t border-[#22222b] flex items-center gap-3 text-[9px] text-[#60606a]">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
          <span className="ml-auto">⌘K anywhere</span>
        </div>
      </div>
    </div>
  );
}
