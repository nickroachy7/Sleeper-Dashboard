import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, Sparkles, Trophy, CornerDownLeft, Plus, Compass,
  Loader2, SendHorizonal, ArrowLeft, Trash2, MessageSquare,
} from 'lucide-react';
import { usePlayers, usePlayerValuesList } from '../hooks/queries';
import { useLeagueDirectory } from '../hooks/detail';
import { useActiveLeague } from '../lib/active-league';
import { openAddLeague } from '../lib/add-league-modal';
import { useLeagueChat } from '../hooks/useLeagueChat';
import { ChatMessageView } from './chat/ChatMessageView';
import { PlayerRow } from './PlayerRow';
import { TeamRow } from './TeamRow';
import { OPEN_LOOKUP_EVENT, type OpenLookupDetail } from '../lib/lookup';

const PAGES = [
  { label: 'Home', to: '/' },
  { label: 'League', to: '/league' },
  { label: 'Players', to: '/players' },
  { label: 'Tools', to: '/trade' },
  { label: 'Rank \'Em', to: '/value-vote' },
  { label: 'Settings', to: '/settings' },
  { label: 'Feedback', to: '/feedback' },
];

interface PlayerResult { kind: 'player'; id: string; to: string; playerId: string; name: string; position?: string; team?: string | null; value?: number; }
interface TeamResult { kind: 'team'; id: string; to: string; rosterId: number; name: string; owner: string; avatarId?: string | null; }
interface LeagueResult { kind: 'league'; id: string; rootLeagueId: string; name: string; season: string; }
interface PageResult { kind: 'page'; id: string; to: string; label: string; }
interface AskResult { kind: 'ask'; id: 'ask'; }
type Result = PlayerResult | TeamResult | LeagueResult | PageResult | AskResult;

function relTime(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Global command bar (⌘K / "/" / search icon) — one surface for "search or
 * ask". In SEARCH mode it finds players/teams/leagues and jumps to pages; the
 * moment you ask a question (Enter on the ask-row, or open with a seed) it
 * flips to CHAT mode and hosts the league assistant inline, reusing the shared
 * conversation engine (useLeagueChat) and message renderer. There's no longer
 * a separate /chat page — the palette is the assistant.
 */
export function LookupSearch() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'search' | 'chat'>('search');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { data: players } = usePlayers();
  const { data: playerValues } = usePlayerValuesList();
  const { data: directory } = useLeagueDirectory();
  const { leagues, activeLeagueId, setActiveLeague } = useActiveLeague();

  const chat = useLeagueChat();
  const {
    leagueContext, sessions, messages, pending, hasThread,
    send, startNewChat, openSession, removeSession, reset,
  } = chat;

  // Open/close hotkeys + external open event (which may carry a seed question).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((v) => !v); }
      else if (e.key === '/' && !typing) { e.preventDefault(); setMode('search'); setOpen(true); }
      else if (e.key === 'Escape') { setOpen(false); }
    };
    const onOpen = (e: Event) => {
      const seed = (e as CustomEvent<OpenLookupDetail>).detail?.seed?.trim();
      if (seed) { setMode('chat'); startNewChat(seed); }
      else { setMode('search'); setQuery(''); }
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_LOOKUP_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_LOOKUP_EVENT, onOpen);
    };
    // startNewChat is stable enough for this listener's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus the right input whenever the surface changes.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => (mode === 'chat' ? chatInputRef : inputRef).current?.focus(), 40);
    return () => clearTimeout(t);
  }, [open, mode]);

  // Keep the thread pinned to the newest message.
  useEffect(() => {
    if (mode === 'chat') scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending, mode]);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) { setQuery(''); setDraft(''); setActiveIdx(0); setMode('search'); reset(); }
  }

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

  // Flip to the assistant and ask, right here in the overlay.
  const ask = (text: string) => {
    const q = text.trim();
    if (!q) return;
    setMode('chat');
    startNewChat(q);
    setQuery('');
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
        {mode === 'search' ? (
          <>
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

              {/* Recent conversations — the palette is the assistant's home now,
                  so surface saved threads when there's nothing being typed. */}
              {!hasQuery && sessions.length > 0 && (
                <Section label="Recent chats">
                  {sessions.slice(0, 5).map((s) => (
                    <div key={s.id} className="group flex items-center gap-2 rounded-xl hover:bg-[#1b1b22] transition-colors">
                      <button
                        onClick={() => { setMode('chat'); openSession(s); }}
                        className="flex items-center gap-3 flex-1 min-w-0 px-3 py-2 text-left"
                      >
                        <span className="w-8 h-8 rounded-lg bg-[#1b1b22] group-hover:bg-[#22222b] flex items-center justify-center shrink-0"><Sparkles className="h-4 w-4 text-[#75757f]" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] text-white truncate">{s.title}</span>
                          <span className="block text-[11px] text-[#60606a]">{relTime(s.updatedAt)}</span>
                        </span>
                      </button>
                      <button onClick={() => removeSession(s.id)} aria-label="Delete chat" className="opacity-0 group-hover:opacity-100 text-[#60606a] hover:text-red-400 px-2 shrink-0 transition-opacity">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </Section>
              )}

              {!hasQuery && sessions.length === 0 && (
                <p className="px-6 py-8 text-center text-[12px] leading-relaxed text-[#60606a]">
                  Search players, teams, leagues — jump to a page, or ask the assistant a question.
                </p>
              )}
            </div>

            <div className="hidden sm:flex px-4 py-2.5 border-t border-[#22222b] items-center gap-3 text-[9px] text-[#60606a] shrink-0">
              <span>↑↓ navigate</span><span>↵ open / ask</span><span>esc close</span><span className="ml-auto">⌘K anywhere</span>
            </div>
          </>
        ) : (
          <>
            {/* ── Chat header ── back to search · title · new · close ── */}
            <div className="flex items-center gap-2 px-3 sm:px-4 h-12 shrink-0 border-b border-[#22222b]">
              <button
                onClick={() => { setMode('search'); reset(); }}
                className="shrink-0 -ml-1 p-1 text-[#75757f] hover:text-white transition-colors"
                aria-label="Back to search"
              >
                <ArrowLeft className="h-[18px] w-[18px]" />
              </button>
              <MessageSquare className="h-[16px] w-[16px] text-accent-500 shrink-0" />
              <span className="flex-1 min-w-0 truncate text-[14px] font-semibold text-white">
                Ask {leagueContext?.name ?? 'the assistant'}
              </span>
              {hasThread && (
                <button
                  onClick={() => startNewChat()}
                  className="flex items-center gap-1 text-[12px] text-[#9c9ca7] hover:text-white px-2 py-1 rounded-lg hover:bg-[#1b1b22] shrink-0 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> New
                </button>
              )}
              <button onClick={() => setOpen(false)} className="sm:hidden text-[15px] font-semibold text-accent-400 shrink-0 ml-1">Done</button>
            </div>

            {/* ── Thread ── */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-4">
              {!hasThread && !pending ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-10">
                  <div className="w-12 h-12 rounded-2xl bg-accent-500/10 flex items-center justify-center mb-3">
                    <Sparkles className="h-6 w-6 text-accent-500" />
                  </div>
                  <p className="text-[15px] font-semibold text-white mb-1">Ask about your league</p>
                  <p className="text-[13px] text-[#9c9ca7] max-w-sm">
                    Rosters, trades, values, matchups — {leagueContext?.name ?? 'your league'} data, answered live.
                  </p>
                </div>
              ) : (
                <div className="max-w-2xl mx-auto w-full space-y-4">
                  {messages.map((m, i) => <ChatMessageView key={i} message={m} />)}
                  {pending && (
                    <div className="flex items-center gap-2 text-[13px] text-[#75757f] pl-10">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Composer ── */}
            <form
              onSubmit={(e) => { e.preventDefault(); send(draft); setDraft(''); }}
              className="shrink-0 px-3 sm:px-5 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-[#22222b]"
            >
              <div className="max-w-2xl mx-auto w-full flex items-center gap-2 rounded-full bg-[#1b1b22] border border-[#2a2a34] focus-within:border-accent-500/50 pl-4 pr-1.5 py-1.5 transition-colors">
                <input
                  ref={chatInputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask about rosters, trades, values…"
                  enterKeyHint="send"
                  autoComplete="off"
                  className="flex-1 min-w-0 bg-transparent text-[14px] text-white placeholder-[#60606a] focus:outline-none py-1"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || pending}
                  aria-label="Send"
                  className="shrink-0 w-8 h-8 rounded-full bg-accent-500 hover:bg-accent-400 disabled:bg-[#26262f] disabled:text-[#60606a] text-[#06110a] flex items-center justify-center transition-colors"
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
                </button>
              </div>
            </form>
          </>
        )}
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
