import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Sparkles, Loader2, SendHorizonal, Plus, Trash2, ArrowLeft, MessageSquare,
} from 'lucide-react';
import { useChatLeagueContext } from '../hooks/queries';
import { useActiveLeague } from '../lib/active-league';
import { ChatMessageView } from '../components/chat/ChatMessageView';
import { askLeagueBot, type ChatMessage } from '../lib/league-chat';
import {
  listSessions, saveSession, deleteSession, newSessionId, titleFromMessages,
  type ChatSession,
} from '../lib/chat-sessions';

function relTime(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Full-page assistant. The command palette (⌘K) hands questions off here via
 * router state ({ seed }); the sidebar/tab-strip link opens it cold. Left rail
 * lists saved conversations, right pane is the live thread. On mobile the two
 * swap in place (list ⇄ conversation). Conversations persist per active league.
 */
export default function Chat() {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeLeagueId } = useActiveLeague();
  const { data: leagueContext } = useChatLeagueContext();
  const chatLeagueId = leagueContext?.seasons[0]?.league_id ?? activeLeagueId ?? null;

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState('');
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const activeIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const setActiveSession = (id: string | null) => { activeIdRef.current = id; };
  const refreshSessions = () => setSessions(listSessions(chatLeagueId));

  // Load this league's saved conversations (and reload on league switch).
  useEffect(() => {
    setSessions(listSessions(chatLeagueId));
    setActiveSession(null);
    setMessages([]);
    setMobileView('list');
  }, [chatLeagueId]);

  // Keep the thread pinned to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

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
    setDraft('');
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
      refreshSessions();
      inputRef.current?.focus();
    }
  };

  const startNewChat = (seed?: string) => {
    setActiveSession(newSessionId());
    setMessages([]);
    setDraft('');
    setMobileView('chat');
    if (seed?.trim()) void send(seed, []);
    else setTimeout(() => inputRef.current?.focus(), 40);
  };

  const openSession = (s: ChatSession) => {
    setActiveSession(s.id);
    setMessages(s.messages);
    setDraft('');
    setMobileView('chat');
  };

  const removeSession = (id: string) => {
    deleteSession(chatLeagueId, id);
    setSessions(listSessions(chatLeagueId));
    if (activeIdRef.current === id) { setActiveSession(null); setMessages([]); setMobileView('list'); }
  };

  // Consume a question handed off from the search palette (router state).
  useEffect(() => {
    const seed = (location.state as { seed?: string } | null)?.seed;
    if (seed?.trim()) {
      startNewChat(seed);
      navigate('/chat', { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const hasThread = messages.length > 0 || activeIdRef.current !== null;
  const title = messages.length ? titleFromMessages(messages) : 'New chat';

  return (
    <div className="flex h-[calc(100dvh-104px-env(safe-area-inset-top))] lg:h-[calc(100dvh-56px)]">
      {/* ── Sessions rail ── */}
      <aside
        className={`w-full lg:w-72 shrink-0 flex-col bg-[#0f0f14] lg:border-r border-[#1b1b22] ${
          mobileView === 'list' ? 'flex' : 'hidden'
        } lg:flex`}
      >
        <div className="flex items-center gap-2 px-4 h-12 shrink-0 border-b border-[#1b1b22]">
          <MessageSquare className="h-[17px] w-[17px] text-accent-500 shrink-0" />
          <span className="flex-1 text-[14px] font-semibold text-white">Chats</span>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            onClick={() => startNewChat()}
            className="flex items-center gap-2.5 w-full px-3 py-3 rounded-xl bg-accent-500/10 hover:bg-accent-500/15 border border-accent-500/20 mb-2 text-left transition-colors"
          >
            <span className="w-8 h-8 rounded-lg bg-accent-500/15 flex items-center justify-center shrink-0">
              <Plus className="h-4 w-4 text-accent-500" />
            </span>
            <span className="text-[14px] font-semibold text-white">New chat</span>
          </button>

          {sessions.length === 0 ? (
            <p className="px-3 py-8 text-center text-[12px] text-[#75757f]">No conversations yet. Start one above.</p>
          ) : (
            sessions.map((s) => {
              const active = activeIdRef.current === s.id;
              return (
                <div
                  key={s.id}
                  className={`group flex items-center gap-2 rounded-xl transition-colors ${
                    active ? 'bg-[#1b1b22]' : 'hover:bg-[#1b1b22]'
                  }`}
                >
                  <button onClick={() => openSession(s)} className="flex items-center gap-3 flex-1 min-w-0 px-3 py-2.5 text-left">
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active ? 'bg-accent-500/15' : 'bg-[#1b1b22] group-hover:bg-[#22222b]'}`}>
                      <Sparkles className={`h-4 w-4 ${active ? 'text-accent-500' : 'text-[#75757f]'}`} />
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
              );
            })
          )}
        </div>
      </aside>

      {/* ── Conversation ── */}
      <section
        className={`flex-1 min-w-0 flex-col ${mobileView === 'chat' ? 'flex' : 'hidden'} lg:flex`}
      >
        <div className="flex items-center gap-2 px-3 lg:px-5 h-12 shrink-0 border-b border-[#1b1b22]">
          <button
            onClick={() => setMobileView('list')}
            className="lg:hidden text-[#75757f] hover:text-white shrink-0 -ml-1 p-1"
            aria-label="Back to chats"
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>
          <span className="flex-1 min-w-0 truncate text-[14px] font-semibold text-white">{title}</span>
          <button
            onClick={() => startNewChat()}
            className="flex items-center gap-1 text-[12px] text-[#9c9ca7] hover:text-white px-2 py-1 rounded-lg hover:bg-[#1b1b22] shrink-0 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 lg:px-6 py-4 space-y-4">
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

        <form
          onSubmit={(e) => { e.preventDefault(); send(draft); }}
          className="shrink-0 px-3 lg:px-6 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-[#1b1b22]"
        >
          <div className="max-w-2xl mx-auto w-full flex items-center gap-2 rounded-full bg-[#1b1b22] border border-[#2a2a34] focus-within:border-accent-500/50 pl-4 pr-1.5 py-1.5 transition-colors">
            <input
              ref={inputRef}
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
      </section>
    </div>
  );
}
