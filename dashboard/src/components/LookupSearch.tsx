import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Sparkles, ArrowLeft, Loader2, Trophy, CornerDownLeft, SendHorizonal } from 'lucide-react';
import { usePlayers, usePlayerValuesList, useChatLeagueContext } from '../hooks/queries';
import { useLeagueDirectory } from '../hooks/detail';
import { useActiveLeague } from '../lib/active-league';
import { PlayerRow } from './PlayerRow';
import { TeamRow } from './TeamRow';
import { ChatMessageView } from './chat/ChatMessageView';
import { OPEN_LOOKUP_EVENT } from '../lib/lookup';
import {
  askLeagueBot,
  loadMessages,
  chatStorageKey,
  type ChatMessage,
} from '../lib/league-chat';

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
interface LeagueResult {
  kind: 'league';
  id: string;
  rootLeagueId: string;
  name: string;
  season: string;
}
interface AskResult {
  kind: 'ask';
  id: 'ask';
}
interface ResumeResult {
  kind: 'resume';
  id: 'resume';
}

type Result = PlayerResult | TeamResult | LeagueResult | AskResult | ResumeResult;

/**
 * Global command palette. Opens via Cmd/Ctrl+K, "/", or the OPEN_LOOKUP_EVENT.
 * Two modes: SEARCH (jump to players / teams / leagues) and CHAT — when the
 * input is a question rather than a name, the assistant answers inline.
 */
export function LookupSearch() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'search' | 'chat'>('search');
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { data: players } = usePlayers();
  const { data: playerValues } = usePlayerValuesList();
  const { data: directory } = useLeagueDirectory();
  const { leagues, activeLeagueId, setActiveLeague } = useActiveLeague();
  const { data: leagueContext } = useChatLeagueContext();

  // ── Chat state ──────────────────────────────────────────────────
  const chatLeagueId = leagueContext?.seasons[0]?.league_id ?? activeLeagueId ?? null;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(loadMessages(chatLeagueId));
  }, [chatLeagueId]);

  useEffect(() => {
    localStorage.setItem(chatStorageKey(chatLeagueId), JSON.stringify(messages));
  }, [messages, chatLeagueId]);

  useEffect(() => {
    if (mode === 'chat') {
      chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, pending, mode]);

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
  }, [open, mode]);

  // Reset to a fresh search when the palette closes.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) { setQuery(''); setActiveIdx(0); setMode('search'); }
  }

  const { teams, playerResults, leagueResults } = useMemo(() => {
    const q = query.trim().toLowerCase();

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
            avatarId: directory.teamAvatar(r.roster_id),
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

    // Leagues the visitor has added — selecting one switches the dashboard.
    const leagueResults: LeagueResult[] = leagues
      .filter((l) => !q || l.name.toLowerCase().includes(q))
      .filter((l) => l.rootLeagueId !== activeLeagueId || !q) // hide the active one only when listing all
      .map((l) => ({
        kind: 'league' as const,
        id: `league-${l.rootLeagueId}`,
        rootLeagueId: l.rootLeagueId,
        name: l.name,
        season: l.season,
      }))
      .slice(0, q ? 4 : 6);

    return { teams, playerResults, leagueResults };
  }, [query, players, playerValues, directory, leagues, activeLeagueId]);

  const hasQuery = query.trim().length > 0;
  const hasStoredChat = messages.length > 0;

  // Flat, ordered list drives keyboard nav. Ask/resume actions bookend it.
  const flat = useMemo<Result[]>(() => {
    const list: Result[] = [...playerResults, ...teams, ...leagueResults];
    if (hasQuery) list.push({ kind: 'ask', id: 'ask' });
    else if (hasStoredChat) list.unshift({ kind: 'resume', id: 'resume' });
    return list;
  }, [playerResults, teams, leagueResults, hasQuery, hasStoredChat]);

  const noNameMatches = playerResults.length === 0 && teams.length === 0 && leagueResults.length === 0;
  // When nothing matches a name, the assistant is the default action.
  useEffect(() => {
    if (hasQuery && noNameMatches) {
      const askIdx = flat.findIndex((r) => r.kind === 'ask');
      if (askIdx >= 0) setActiveIdx(askIdx);
    }
  }, [hasQuery, noNameMatches, flat]);

  // Plain functions (not memoized) so they always capture the latest
  // leagueContext / messages — a stale closure here would drop league scope.
  const enterChat = (seed: string) => {
    const question = seed.trim();
    setMode('chat');
    setQuery('');
    if (question) void send(question);
  };

  const go = (r: Result | undefined) => {
    if (!r) return;
    if (r.kind === 'ask') return enterChat(query);
    if (r.kind === 'resume') { setMode('chat'); setQuery(''); return; }
    if (r.kind === 'league') {
      setActiveLeague(r.rootLeagueId);
      setOpen(false);
      navigate('/');
      return;
    }
    setOpen(false);
    navigate(r.to);
  };

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || pending) return;
    const history = [...messages, { role: 'user' as const, content: question }];
    setMessages(history);
    setQuery('');
    setPending(true);
    try {
      const turns = history.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
      const { reply, steps, widgets } = await askLeagueBot(turns, leagueContext ?? null);
      setMessages([...history, { role: 'assistant', content: reply, steps, widgets }]);
    } catch (e) {
      setMessages([
        ...history,
        { role: 'assistant', content: e instanceof Error ? e.message : 'Something went wrong.', error: true },
      ]);
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  };

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem(chatStorageKey(chatLeagueId));
  };

  if (!open) return null;

  const idxOf = (r: Result) => flat.indexOf(r);
  const activeClass = (r: Result) => (idxOf(r) === activeIdx ? 'bg-[#1b1b22]' : '');

  const inChat = mode === 'chat';

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/70 sm:backdrop-blur-sm flex items-stretch sm:items-start justify-center sm:pt-[10vh] sm:px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="flex flex-col w-full h-full sm:h-auto sm:max-h-[80vh] sm:max-w-xl bg-[#141419] sm:border sm:border-[#2a2a34] sm:rounded-2xl overflow-hidden sm:shadow-2xl sm:ring-1 sm:ring-black/40 pt-[env(safe-area-inset-top)] sm:pt-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-2.5 px-4 border-b border-[#22222b] shrink-0">
          {inChat ? (
            <button
              onClick={() => { setMode('search'); setQuery(''); setTimeout(() => inputRef.current?.focus(), 0); }}
              className="text-[#75757f] hover:text-white shrink-0"
              aria-label="Back to search"
            >
              <ArrowLeft className="h-[18px] w-[18px]" />
            </button>
          ) : (
            <Search className="h-[18px] w-[18px] text-[#75757f] shrink-0" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={(e) => {
              if (inChat) {
                if (e.key === 'Enter') { e.preventDefault(); send(query); }
                return;
              }
              if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, flat.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
              if (e.key === 'Enter') { e.preventDefault(); go(flat[activeIdx]); }
            }}
            placeholder={inChat ? 'Ask a follow-up…' : 'Search players, teams, leagues — or ask a question'}
            type={inChat ? 'text' : 'search'}
            inputMode="search"
            enterKeyHint={inChat ? 'send' : 'go'}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            className="flex-1 min-w-0 bg-transparent py-3.5 sm:py-4 text-base text-white placeholder-[#75757f] focus:outline-none focus-visible:outline-none [appearance:none] [&::-webkit-search-cancel-button]:hidden"
          />
          {inChat && pending && <Loader2 className="h-4 w-4 animate-spin text-accent-500 shrink-0" />}
          {inChat && !pending && query.trim() && (
            <button
              onClick={() => send(query)}
              aria-label="Send"
              className="w-8 h-8 flex items-center justify-center text-accent-500 hover:text-accent-400 shrink-0"
            >
              <SendHorizonal className="h-4 w-4" />
            </button>
          )}
          {!inChat && query && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="w-8 h-8 -mr-1 flex items-center justify-center text-[#60606a] hover:text-white active:text-white transition-colors shrink-0"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {inChat && messages.length > 0 && (
            <button onClick={clearChat} className="text-[11px] text-[#75757f] hover:text-[#d6d6de] shrink-0">
              Clear
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            className="sm:hidden ml-1 text-[15px] font-semibold text-accent-400 active:text-accent-500 shrink-0"
          >
            Cancel
          </button>
        </div>

        {/* Body: chat conversation or search results */}
        {inChat ? (
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Querying the league database…
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto overscroll-contain py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {playerResults.length > 0 && (
              <Section label="Players">
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
              </Section>
            )}

            {teams.length > 0 && (
              <Section label={query ? 'Teams' : 'League Teams'}>
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
              </Section>
            )}

            {leagueResults.length > 0 && (
              <Section label="Leagues">
                {leagueResults.map((r) => (
                  <button
                    key={r.id}
                    onPointerEnter={() => setActiveIdx(idxOf(r))}
                    onClick={() => go(r)}
                    className={`flex items-center gap-3 px-4 py-2 w-full text-left ${activeClass(r)}`}
                  >
                    <span className="w-8 h-8 rounded-lg bg-[#1b1b22] flex items-center justify-center shrink-0">
                      <Trophy className="h-4 w-4 text-[#75757f]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-white truncate">{r.name}</span>
                      <span className="block text-[11px] text-[#75757f]">{r.season} season</span>
                    </span>
                    {r.rootLeagueId === activeLeagueId && (
                      <span className="text-[10px] text-accent-500 font-semibold">Active</span>
                    )}
                  </button>
                ))}
              </Section>
            )}

            {/* Ask-the-assistant action (query present) or resume (idle) */}
            {hasQuery ? (
              <div onPointerEnter={() => setActiveIdx(flat.findIndex((r) => r.kind === 'ask'))}>
                <AskRow
                  query={query}
                  active={flat[activeIdx]?.kind === 'ask'}
                  emphasized={noNameMatches}
                  onClick={() => enterChat(query)}
                />
              </div>
            ) : hasStoredChat ? (
              <button
                onPointerEnter={() => setActiveIdx(0)}
                onClick={() => { setMode('chat'); setQuery(''); }}
                className={`flex items-center gap-3 px-4 py-2.5 w-full text-left ${flat[activeIdx]?.kind === 'resume' ? 'bg-[#1b1b22]' : ''}`}
              >
                <span className="w-8 h-8 rounded-lg bg-accent-500/10 flex items-center justify-center shrink-0">
                  <Sparkles className="h-4 w-4 text-accent-500" />
                </span>
                <span className="text-[13px] text-[#d6d6de]">Continue your conversation</span>
              </button>
            ) : null}

            {noNameMatches && !hasQuery && leagueResults.length === 0 && teams.length === 0 && (
              <p className="px-4 py-8 text-center text-[12px] text-[#75757f]">
                Type to search players, teams, leagues — or ask the assistant a question.
              </p>
            )}
          </div>
        )}

        {/* Footer hints (desktop) */}
        {!inChat && (
          <div className="hidden sm:flex px-4 py-2.5 border-t border-[#22222b] items-center gap-3 text-[9px] text-[#60606a] shrink-0">
            <span>↑↓ navigate</span>
            <span>↵ open / ask</span>
            <span>esc close</span>
            <span className="ml-auto">⌘K anywhere</span>
          </div>
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

function AskRow({
  query,
  active,
  emphasized,
  onClick,
}: {
  query: string;
  active: boolean;
  emphasized: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-2.5 w-full text-left border-t border-[#1b1b22] ${
        active ? 'bg-accent-500/10' : ''
      } ${emphasized ? 'mt-0' : 'mt-1'}`}
    >
      <span className="w-8 h-8 rounded-lg bg-accent-500/10 flex items-center justify-center shrink-0">
        <Sparkles className="h-4 w-4 text-accent-500" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-white truncate">
          Ask the assistant<span className="text-[#75757f]"> — “{query}”</span>
        </span>
        <span className="block text-[11px] text-[#75757f]">
          {emphasized ? 'No name matches — get an answer from the league data' : 'Answered live from your league data'}
        </span>
      </span>
      <CornerDownLeft className="h-3.5 w-3.5 text-[#60606a] shrink-0" />
    </button>
  );
}
