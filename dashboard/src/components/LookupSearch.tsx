import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, Sparkles, ArrowLeft, Loader2, Trophy, CornerDownLeft,
  SendHorizonal, Plus, Compass, Trash2, MessageSquare,
} from 'lucide-react';
import { usePlayers, usePlayerValuesList, useChatLeagueContext } from '../hooks/queries';
import { useLeagueDirectory } from '../hooks/detail';
import { useActiveLeague } from '../lib/active-league';
import { openAddLeague } from '../lib/add-league-modal';
import { PlayerRow } from './PlayerRow';
import { TeamRow } from './TeamRow';
import { ChatMessageView } from './chat/ChatMessageView';
import { OPEN_LOOKUP_EVENT, OPEN_CHAT_EVENT } from '../lib/lookup';
import { askLeagueBot, type ChatMessage } from '../lib/league-chat';
import {
  listSessions, saveSession, deleteSession, newSessionId, titleFromMessages,
  type ChatSession,
} from '../lib/chat-sessions';

const PAGES = [
  { label: 'Dashboard', to: '/' },
  { label: 'League', to: '/league' },
  { label: 'Players', to: '/players' },
  { label: 'Trade', to: '/trade' },
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
 * Global command bar. Opens in three modes:
 *  - search  (⌘K / "/" / search icon): find players/teams/leagues, jump to a
 *    page, or ask the assistant.
 *  - chat    : a live conversation (input pill pinned at the bottom).
 *  - sessions (chat button): start a new chat or resume a previous one.
 * Requests keep running if the overlay closes — the component stays mounted.
 */
export function LookupSearch() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'search' | 'chat' | 'sessions'>('search');
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { data: players } = usePlayers();
  const { data: playerValues } = usePlayerValuesList();
  const { data: directory } = useLeagueDirectory();
  const { leagues, activeLeagueId, setActiveLeague } = useActiveLeague();
  const { data: leagueContext } = useChatLeagueContext();
  const chatLeagueId = leagueContext?.seasons[0]?.league_id ?? activeLeagueId ?? null;

  // ── Chat/session state ──
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const activeIdRef = useRef<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const setActiveSession = (id: string | null) => { activeIdRef.current = id; };
  const refreshSessions = () => setSessions(listSessions(chatLeagueId));

  useEffect(() => {
    if (mode === 'chat') {
      chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, pending, mode]);

  // Open/close hotkeys + external open events.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((v) => !v); setMode('search'); }
      else if (e.key === '/' && !typing) { e.preventDefault(); setOpen(true); setMode('search'); }
      else if (e.key === 'Escape') { setOpen(false); }
    };
    const onOpenSearch = () => { setMode('search'); setQuery(''); setOpen(true); };
    const onOpenChat = () => { refreshSessions(); setQuery(''); setMode('sessions'); setOpen(true); };
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_LOOKUP_EVENT, onOpenSearch);
    window.addEventListener(OPEN_CHAT_EVENT, onOpenChat);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_LOOKUP_EVENT, onOpenSearch);
      window.removeEventListener(OPEN_CHAT_EVENT, onOpenChat);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatLeagueId]);

  useEffect(() => {
    if (open && mode !== 'sessions') setTimeout(() => inputRef.current?.focus(), 40);
  }, [open, mode]);

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

  const noMatches = pageResults.length === 0 && playerResults.length === 0 && teams.length === 0 && leagueResults.length === 0;
  useEffect(() => {
    if (hasQuery && noMatches) { const i = flat.findIndex((r) => r.kind === 'ask'); if (i >= 0) setActiveIdx(i); }
  }, [hasQuery, noMatches, flat]);

  // ── Chat plumbing (plain fns capture latest state) ──
  const persist = (sessionId: string, msgs: ChatMessage[]) => {
    if (!msgs.length) return;
    saveSession(chatLeagueId, { id: sessionId, title: titleFromMessages(msgs), messages: msgs, updatedAt: Date.now() });
  };

  const send = async (text: string, base?: ChatMessage[]) => {
    const question = text.trim();
    if (!question || pending) return;
    let sessionId = activeIdRef.current;
    if (!sessionId) { sessionId = newSessionId(); setActiveSession(sessionId); }
    const history = [...(base ?? messages), { role: 'user' as const, content: question }];
    setMessages(history);
    persist(sessionId, history);
    setQuery('');
    setPending(true);
    try {
      const turns = history.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
      const { reply, steps, widgets } = await askLeagueBot(turns, leagueContext ?? null);
      const final = [...history, { role: 'assistant' as const, content: reply, steps, widgets }];
      persist(sessionId, final);
      if (activeIdRef.current === sessionId) setMessages(final);
    } catch (e) {
      const final = [...history, { role: 'assistant' as const, content: e instanceof Error ? e.message : 'Something went wrong.', error: true }];
      persist(sessionId, final);
      if (activeIdRef.current === sessionId) setMessages(final);
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  };

  const startNewChat = (seed?: string) => {
    setActiveSession(newSessionId());
    setMessages([]);
    setMode('chat');
    setQuery('');
    if (seed?.trim()) void send(seed, []);
  };

  const openSession = (s: ChatSession) => {
    setActiveSession(s.id);
    setMessages(s.messages);
    setMode('chat');
    setQuery('');
  };

  const removeSession = (id: string) => {
    deleteSession(chatLeagueId, id);
    const next = listSessions(chatLeagueId);
    setSessions(next);
    if (activeIdRef.current === id) setActiveSession(null);
  };

  // ── Search actions ──
  const go = (r: Result | undefined) => {
    if (!r) return;
    if (r.kind === 'ask') return startNewChat(query);
    if (r.kind === 'league') { setActiveLeague(r.rootLeagueId); setOpen(false); navigate('/'); return; }
    setOpen(false);
    navigate(r.to);
  };

  if (!open) return null;

  const idxOf = (r: Result) => flat.indexOf(r);
  const activeClass = (r: Result) => (idxOf(r) === activeIdx ? 'bg-[#1b1b22]' : '');
  const sessionTitle = messages.length ? titleFromMessages(messages) : 'New chat';

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/70 sm:backdrop-blur-sm flex items-stretch sm:items-start justify-center sm:pt-[10vh] sm:px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="flex flex-col w-full h-full sm:h-auto sm:max-h-[80vh] sm:max-w-xl bg-[#141419] sm:border sm:border-[#2a2a34] sm:rounded-2xl overflow-hidden sm:shadow-2xl sm:ring-1 sm:ring-black/40 pt-[env(safe-area-inset-top)] sm:pt-0"
        onClick={(e) => e.stopPropagation()}
      >
        {mode === 'chat' ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-2 px-3 h-14 border-b border-[#22222b] shrink-0">
              <button
                onClick={() => { refreshSessions(); setMode('sessions'); }}
                className="text-[#75757f] hover:text-white shrink-0"
                aria-label="Back to chats"
              >
                <ArrowLeft className="h-[18px] w-[18px]" />
              </button>
              <span className="flex-1 min-w-0 truncate text-[14px] font-semibold text-white">{sessionTitle}</span>
              <button
                onClick={() => startNewChat()}
                className="flex items-center gap-1 text-[12px] text-[#9c9ca7] hover:text-white px-2 py-1 rounded-lg hover:bg-[#1b1b22] shrink-0"
              >
                <Plus className="h-3.5 w-3.5" /> New
              </button>
              <button onClick={() => setOpen(false)} className="text-[13px] font-semibold text-accent-400 active:text-accent-500 shrink-0 pl-1">Close</button>
            </div>

            {/* Messages (top → down) */}
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-4">
              {messages.length === 0 && !pending ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-10">
                  <div className="w-11 h-11 rounded-2xl bg-accent-500/10 flex items-center justify-center mb-3">
                    <Sparkles className="h-5 w-5 text-accent-500" />
                  </div>
                  <p className="text-[13px] text-[#9c9ca7] max-w-xs">
                    Ask about rosters, trades, values, matchups — {leagueContext?.name ?? 'your league'} data, answered live.
                  </p>
                </div>
              ) : (
                <>
                  {messages.map((m, i) => <ChatMessageView key={i} message={m} />)}
                  {pending && (
                    <div className="flex items-center gap-2 text-[13px] text-[#75757f] pl-10">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Input pill pinned to the bottom */}
            <form
              onSubmit={(e) => { e.preventDefault(); send(query); }}
              className="shrink-0 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-[#22222b]"
            >
              <div className="flex items-center gap-2 rounded-full bg-[#1b1b22] border border-[#2a2a34] focus-within:border-accent-500/50 pl-4 pr-1.5 py-1.5 transition-colors">
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask a follow-up…"
                  enterKeyHint="send"
                  autoComplete="off"
                  className="flex-1 min-w-0 bg-transparent text-[14px] text-white placeholder-[#60606a] focus:outline-none py-1"
                />
                <button
                  type="submit"
                  disabled={!query.trim() || pending}
                  aria-label="Send"
                  className="shrink-0 w-8 h-8 rounded-full bg-accent-500 hover:bg-accent-400 disabled:bg-[#26262f] disabled:text-[#60606a] text-[#06110a] flex items-center justify-center transition-colors"
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
                </button>
              </div>
            </form>
          </>
        ) : mode === 'sessions' ? (
          <>
            <div className="flex items-center gap-2 px-4 h-14 border-b border-[#22222b] shrink-0">
              <MessageSquare className="h-[18px] w-[18px] text-accent-500 shrink-0" />
              <span className="flex-1 text-[15px] font-semibold text-white">Chats</span>
              <button onClick={() => setOpen(false)} className="text-[13px] font-semibold text-accent-400 shrink-0">Close</button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                onClick={() => startNewChat()}
                className="flex items-center gap-2.5 w-full px-3 py-3 rounded-xl bg-accent-500/10 hover:bg-accent-500/15 border border-accent-500/20 mb-2 text-left"
              >
                <span className="w-8 h-8 rounded-lg bg-accent-500/15 flex items-center justify-center shrink-0">
                  <Plus className="h-4 w-4 text-accent-500" />
                </span>
                <span className="text-[14px] font-semibold text-white">New chat</span>
              </button>

              {sessions.length === 0 ? (
                <p className="px-3 py-8 text-center text-[12px] text-[#75757f]">No conversations yet. Start one above.</p>
              ) : (
                sessions.map((s) => (
                  <div key={s.id} className="group flex items-center gap-2 rounded-xl hover:bg-[#1b1b22]">
                    <button onClick={() => openSession(s)} className="flex items-center gap-3 flex-1 min-w-0 px-3 py-2.5 text-left">
                      <span className="w-8 h-8 rounded-lg bg-[#1b1b22] group-hover:bg-[#22222b] flex items-center justify-center shrink-0">
                        <Sparkles className="h-4 w-4 text-[#75757f]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] text-white truncate">{s.title}</span>
                        <span className="block text-[11px] text-[#60606a]">{relTime(s.updatedAt)}</span>
                      </span>
                    </button>
                    <button
                      onClick={() => removeSession(s.id)}
                      aria-label="Delete chat"
                      className="opacity-0 group-hover:opacity-100 text-[#60606a] hover:text-red-400 px-2 shrink-0 transition-opacity"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            {/* Search input */}
            <div className="flex items-center gap-2.5 px-4 border-b border-[#22222b] shrink-0">
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
                className="flex-1 min-w-0 bg-transparent py-3.5 sm:py-4 text-base text-white placeholder-[#75757f] focus:outline-none [appearance:none] [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button onClick={() => { setQuery(''); inputRef.current?.focus(); }} className="w-8 h-8 -mr-1 flex items-center justify-center text-[#60606a] hover:text-white shrink-0" aria-label="Clear">
                  <X className="h-4 w-4" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="sm:hidden ml-1 text-[15px] font-semibold text-accent-400 shrink-0">Cancel</button>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto overscroll-contain py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              {pageResults.length > 0 && (
                <Section label="Go to">
                  {pageResults.map((r) => (
                    <button key={r.id} onPointerEnter={() => setActiveIdx(idxOf(r))} onClick={() => go(r)} className={`flex items-center gap-3 px-4 py-2 w-full text-left ${activeClass(r)}`}>
                      <span className="w-8 h-8 rounded-lg bg-[#1b1b22] flex items-center justify-center shrink-0"><Compass className="h-4 w-4 text-[#75757f]" /></span>
                      <span className="text-[13px] text-white">{r.label}</span>
                    </button>
                  ))}
                </Section>
              )}

              {playerResults.length > 0 && (
                <Section label="Players">
                  {playerResults.map((r) => (
                    <div key={r.id} onPointerEnter={() => setActiveIdx(idxOf(r))}>
                      <PlayerRow playerId={r.playerId} name={r.name} position={r.position} team={r.team} value={r.value} size="sm" onClick={() => setOpen(false)} className={activeClass(r)} />
                    </div>
                  ))}
                </Section>
              )}

              {teams.length > 0 && (
                <Section label={query ? 'Teams' : 'League Teams'}>
                  {teams.map((r) => (
                    <div key={r.id} onPointerEnter={() => setActiveIdx(idxOf(r))}>
                      <TeamRow rosterId={r.rosterId} name={r.name} subtitle={r.owner} avatarId={r.avatarId} size="sm" onClick={() => setOpen(false)} className={activeClass(r)} />
                    </div>
                  ))}
                </Section>
              )}

              {leagueResults.length > 0 && (
                <Section label="Leagues">
                  {leagueResults.map((r) => (
                    <button key={r.id} onPointerEnter={() => setActiveIdx(idxOf(r))} onClick={() => go(r)} className={`flex items-center gap-3 px-4 py-2 w-full text-left ${activeClass(r)}`}>
                      <span className="w-8 h-8 rounded-lg bg-[#1b1b22] flex items-center justify-center shrink-0"><Trophy className="h-4 w-4 text-[#75757f]" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] text-white truncate">{r.name}</span>
                        <span className="block text-[11px] text-[#75757f]">{r.season} season</span>
                      </span>
                      {r.rootLeagueId === activeLeagueId && <span className="text-[10px] text-accent-500 font-semibold">Active</span>}
                    </button>
                  ))}
                  <button onClick={() => { setOpen(false); openAddLeague(); }} className="flex items-center gap-3 px-4 py-2 w-full text-left text-[#9c9ca7] hover:text-white">
                    <span className="w-8 h-8 rounded-lg bg-[#1b1b22] flex items-center justify-center shrink-0"><Plus className="h-4 w-4 text-[#75757f]" /></span>
                    <span className="text-[13px]">Add a league</span>
                  </button>
                </Section>
              )}

              {hasQuery && (
                <div onPointerEnter={() => setActiveIdx(flat.findIndex((r) => r.kind === 'ask'))}>
                  <AskRow query={query} active={flat[activeIdx]?.kind === 'ask'} emphasized={noMatches} onClick={() => startNewChat(query)} />
                </div>
              )}

              {!hasQuery && (
                <p className="px-4 py-8 text-center text-[12px] text-[#75757f]">
                  Search players, teams, leagues — jump to a page, or ask the assistant.
                </p>
              )}
            </div>

            <div className="hidden sm:flex px-4 py-2.5 border-t border-[#22222b] items-center gap-3 text-[9px] text-[#60606a] shrink-0">
              <span>↑↓ navigate</span><span>↵ open / ask</span><span>esc close</span><span className="ml-auto">⌘K anywhere</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-4 pt-1.5 pb-1 text-[10px] font-bold tracking-[0.18em] uppercase text-[#60606a]">{label}</p>
      {children}
    </div>
  );
}

function AskRow({ query, active, emphasized, onClick }: { query: string; active: boolean; emphasized: boolean; onClick: () => void; }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-3 px-4 py-2.5 w-full text-left border-t border-[#1b1b22] ${active ? 'bg-accent-500/10' : ''}`}>
      <span className="w-8 h-8 rounded-lg bg-accent-500/10 flex items-center justify-center shrink-0"><Sparkles className="h-4 w-4 text-accent-500" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-white truncate">Ask the assistant<span className="text-[#75757f]"> — “{query}”</span></span>
        <span className="block text-[11px] text-[#75757f]">{emphasized ? 'No match — get an answer from the league data' : 'Answered live from your league data'}</span>
      </span>
      <CornerDownLeft className="h-3.5 w-3.5 text-[#60606a] shrink-0" />
    </button>
  );
}
