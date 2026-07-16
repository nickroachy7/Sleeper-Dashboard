import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, Sparkles, Trophy, CornerDownLeft, Plus, Compass,
} from 'lucide-react';
import { usePlayers, usePlayerValuesList } from '../hooks/queries';
import { useLeagueDirectory } from '../hooks/detail';
import { useActiveLeague } from '../lib/active-league';
import { openAddLeague } from '../lib/add-league-modal';
import { PlayerRow } from './PlayerRow';
import { TeamRow } from './TeamRow';
import { OPEN_LOOKUP_EVENT } from '../lib/lookup';

const PAGES = [
  { label: 'Home', to: '/' },
  { label: 'League', to: '/league' },
  { label: 'Players', to: '/players' },
  { label: 'Tools', to: '/trade' },
  { label: 'Rank \'Em', to: '/value-vote' },
  { label: 'Chat', to: '/chat' },
  { label: 'Settings', to: '/settings' },
  { label: 'Feedback', to: '/feedback' },
];

interface PlayerResult { kind: 'player'; id: string; to: string; playerId: string; name: string; position?: string; team?: string | null; value?: number; }
interface TeamResult { kind: 'team'; id: string; to: string; rosterId: number; name: string; owner: string; avatarId?: string | null; }
interface LeagueResult { kind: 'league'; id: string; rootLeagueId: string; name: string; season: string; }
interface PageResult { kind: 'page'; id: string; to: string; label: string; }
interface AskResult { kind: 'ask'; id: 'ask'; }
type Result = PlayerResult | TeamResult | LeagueResult | PageResult | AskResult;

/**
 * Global command bar (⌘K / "/" / search icon). Finds players/teams/leagues,
 * jumps to a page — and, when what you typed reads like a question (or matches
 * nothing), hands it to the assistant by navigating to /chat with the query as
 * a seed. Search and chat stay cleanly separated: this bar finds things, the
 * /chat page answers questions.
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
  const { leagues, activeLeagueId, setActiveLeague } = useActiveLeague();

  // Open/close hotkeys + external open event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((v) => !v); }
      else if (e.key === '/' && !typing) { e.preventDefault(); setOpen(true); }
      else if (e.key === 'Escape') { setOpen(false); }
    };
    const onOpen = () => { setQuery(''); setOpen(true); };
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_LOOKUP_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_LOOKUP_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 40);
  }, [open]);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) { setPrevOpen(open); if (!open) { setQuery(''); setActiveIdx(0); } }

  // ── Search results ──
  const { teams, playerResults, leagueResults, pageResults } = useMemo(() => {
    const q = query.trim().toLowerCase();

    let teams: TeamResult[] = [];
    if (directory) {
      teams = directory.rosters
        .filter((r) => r.league_id === directory.currentLeagueId)
        .map((r) => {
          const owner = directory.users.find((u) => u.user_id === r.owner_id);
          return {
            kind: 'team' as const, id: `team-${r.roster_id}`, to: `/teams/${r.roster_id}`,
            rosterId: r.roster_id, name: directory.teamName(r.roster_id),
            owner: owner?.display_name || owner?.username || '', avatarId: directory.teamAvatar(r.roster_id),
          };
        })
        .filter((t) => !q || t.name.toLowerCase().includes(q) || t.owner.toLowerCase().includes(q))
        .slice(0, q ? 4 : 12);
    }

    let playerResults: PlayerResult[] = [];
    if (q && players) {
      playerResults = players
        .filter((p) => p.full_name?.toLowerCase().includes(q))
        .map((p) => ({ p, value: playerValues?.get(p.player_id) || 0 }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6)
        .map(({ p, value }) => ({
          kind: 'player' as const, id: `player-${p.player_id}`, to: `/players/${p.player_id}`,
          playerId: p.player_id, name: p.full_name, position: p.position, team: p.team, value,
        }));
    }

    const leagueResults: LeagueResult[] = leagues
      .filter((l) => !q || l.name.toLowerCase().includes(q))
      .map((l) => ({ kind: 'league' as const, id: `league-${l.rootLeagueId}`, rootLeagueId: l.rootLeagueId, name: l.name, season: l.season }))
      .slice(0, q ? 4 : 6);

    const pageResults: PageResult[] = q
      ? PAGES.filter((p) => p.label.toLowerCase().includes(q)).map((p) => ({ kind: 'page' as const, id: `page-${p.to}`, to: p.to, label: p.label }))
      : [];

    return { teams, playerResults, leagueResults, pageResults };
  }, [query, players, playerValues, directory, leagues]);

  const hasQuery = query.trim().length > 0;
  const flat = useMemo<Result[]>(() => {
    const list: Result[] = [...pageResults, ...playerResults, ...teams, ...leagueResults];
    if (hasQuery) list.push({ kind: 'ask', id: 'ask' });
    return list;
  }, [pageResults, playerResults, teams, leagueResults, hasQuery]);

  // When nothing matches, `flat` is just the ask-row at index 0 — and activeIdx
  // resets to 0 on every keystroke, so it's already selected. No effect needed.
  const noMatches = pageResults.length === 0 && playerResults.length === 0 && teams.length === 0 && leagueResults.length === 0;

  // Hand a question off to the /chat page and close the palette.
  const ask = (text: string) => {
    const q = text.trim();
    if (!q) return;
    setOpen(false);
    navigate('/chat', { state: { seed: q } });
  };

  const go = (r: Result | undefined) => {
    if (!r) return;
    if (r.kind === 'ask') return ask(query);
    if (r.kind === 'league') { setActiveLeague(r.rootLeagueId); setOpen(false); navigate('/'); return; }
    setOpen(false);
    navigate(r.to);
  };

  if (!open) return null;

  const idxOf = (r: Result) => flat.indexOf(r);
  const activeClass = (r: Result) => (idxOf(r) === activeIdx ? 'bg-[#1b1b22]' : '');

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/70 sm:backdrop-blur-sm flex items-stretch sm:items-start justify-center sm:pt-[10vh] sm:px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="flex flex-col w-full h-full sm:h-auto sm:max-h-[80vh] sm:max-w-xl bg-[#141419] sm:border sm:border-[#2a2a34] sm:rounded-2xl overflow-hidden sm:shadow-2xl sm:ring-1 sm:ring-black/40 pt-[env(safe-area-inset-top)] sm:pt-0 animate-palette-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input — shaped like the chat bubble (rounded pill, same
            surface + accent focus) so search and chat read as one family. */}
        <div className="flex items-center gap-2 px-3 sm:px-4 py-3 border-b border-[#22222b] shrink-0">
          <div className="flex-1 min-w-0 flex items-center gap-2.5 rounded-full bg-[#1b1b22] border border-[#2a2a34] focus-within:border-accent-500/50 pl-4 pr-2 transition-colors">
            <Search className="h-[18px] w-[18px] text-[#75757f] shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, flat.length - 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
                if (e.key === 'Enter') { e.preventDefault(); go(flat[activeIdx]); }
              }}
              placeholder="Search, go to a page, or ask a question"
              type="search" inputMode="search" enterKeyHint="go"
              autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
              className="flex-1 min-w-0 bg-transparent py-2.5 text-base text-white placeholder-[#75757f] focus:outline-none [appearance:none] [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button onClick={() => { setQuery(''); inputRef.current?.focus(); }} className="w-7 h-7 -mr-0.5 flex items-center justify-center text-[#60606a] hover:text-white shrink-0" aria-label="Clear">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button onClick={() => setOpen(false)} className="sm:hidden text-[15px] font-semibold text-accent-400 shrink-0">Cancel</button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto overscroll-contain py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {pageResults.length > 0 && (
            <Section label="Go to">
              {pageResults.map((r) => (
                <button key={r.id} onPointerEnter={() => setActiveIdx(idxOf(r))} onClick={() => go(r)} className={`flex items-center gap-3 px-3 py-2 w-full text-left rounded-xl transition-colors ${activeClass(r)}`}>
                  <span className="w-8 h-8 rounded-lg bg-[#1b1b22] flex items-center justify-center shrink-0"><Compass className="h-4 w-4 text-[#75757f]" /></span>
                  <span className="text-[13.5px] text-white">{r.label}</span>
                </button>
              ))}
            </Section>
          )}

          {playerResults.length > 0 && (
            <Section label="Players">
              {playerResults.map((r) => (
                <div key={r.id} onPointerEnter={() => setActiveIdx(idxOf(r))}>
                  <PlayerRow playerId={r.playerId} name={r.name} position={r.position} team={r.team} value={r.value} size="sm" onClick={() => setOpen(false)} className={`rounded-xl ${activeClass(r)}`} />
                </div>
              ))}
            </Section>
          )}

          {teams.length > 0 && (
            <Section label={query ? 'Teams' : 'League Teams'}>
              {teams.map((r) => (
                <div key={r.id} onPointerEnter={() => setActiveIdx(idxOf(r))}>
                  <TeamRow rosterId={r.rosterId} name={r.name} subtitle={r.owner} avatarId={r.avatarId} size="sm" onClick={() => setOpen(false)} className={`rounded-xl ${activeClass(r)}`} />
                </div>
              ))}
            </Section>
          )}

          {leagueResults.length > 0 && (
            <Section label="Leagues">
              {leagueResults.map((r) => (
                <button key={r.id} onPointerEnter={() => setActiveIdx(idxOf(r))} onClick={() => go(r)} className={`flex items-center gap-3 px-3 py-2 w-full text-left rounded-xl transition-colors ${activeClass(r)}`}>
                  <span className="w-9 h-9 rounded-full bg-[#1b1b22] flex items-center justify-center shrink-0"><Trophy className="h-4 w-4 text-[#75757f]" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] text-white truncate">{r.name}</span>
                    <span className="block text-[11px] text-[#75757f]">{r.season} season</span>
                  </span>
                  {r.rootLeagueId === activeLeagueId && <span className="text-[10px] text-accent-500 font-semibold">Active</span>}
                </button>
              ))}
              <button onClick={() => { setOpen(false); openAddLeague(); }} className="flex items-center gap-3 px-3 py-2 w-full text-left text-[#9c9ca7] hover:text-white rounded-xl transition-colors hover:bg-[#1b1b22]">
                <span className="w-9 h-9 rounded-full bg-[#1b1b22] flex items-center justify-center shrink-0"><Plus className="h-4 w-4 text-[#75757f]" /></span>
                <span className="text-[13.5px]">Add a league</span>
              </button>
            </Section>
          )}

          {hasQuery && (
            <div className="px-2 pt-1" onPointerEnter={() => setActiveIdx(flat.findIndex((r) => r.kind === 'ask'))}>
              <AskRow query={query} active={flat[activeIdx]?.kind === 'ask'} emphasized={noMatches} onClick={() => ask(query)} />
            </div>
          )}

          {!hasQuery && (
            <p className="px-6 py-8 text-center text-[12px] leading-relaxed text-[#60606a]">
              Search players, teams, leagues — jump to a page, or ask the assistant a question.
            </p>
          )}
        </div>

        <div className="hidden sm:flex px-4 py-2.5 border-t border-[#22222b] items-center gap-3 text-[9px] text-[#60606a] shrink-0">
          <span>↑↓ navigate</span><span>↵ open / ask</span><span>esc close</span><span className="ml-auto">⌘K anywhere</span>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <p className="px-5 pt-2 pb-1.5 text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[#60606a]">{label}</p>
      <div className="px-2 space-y-0.5">{children}</div>
    </div>
  );
}

function AskRow({ query, active, emphasized, onClick }: { query: string; active: boolean; emphasized: boolean; onClick: () => void; }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 w-full text-left rounded-xl border transition-colors ${
        active
          ? 'bg-accent-500/12 border-accent-500/40'
          : 'bg-accent-500/[0.06] border-accent-500/15 hover:bg-accent-500/10'
      }`}
    >
      <span className="w-9 h-9 rounded-full bg-accent-500/15 flex items-center justify-center shrink-0"><Sparkles className="h-4 w-4 text-accent-500" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] text-white truncate">Ask the assistant<span className="text-[#75757f]"> — “{query}”</span></span>
        <span className="block text-[11px] text-[#75757f]">{emphasized ? 'No match — get an answer from the league data' : 'Answered live from your league data'}</span>
      </span>
      <CornerDownLeft className="h-3.5 w-3.5 text-accent-500/70 shrink-0" />
    </button>
  );
}
