import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useChatLeagueContext, type ChatLeagueContext } from '../hooks/queries';
import { ChatWidgets, type ChatWidget } from '../components/chat/ChatWidgets';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Sparkles,
  SendHorizonal,
  Loader2,
  Database,
  Trash2,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────

interface QueryStep {
  sql: string;
  rows: number | null;
  error: string | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  steps?: QueryStep[];
  widgets?: ChatWidget[];
  error?: boolean;
}

// Persist per active league so switching leagues shows that league's thread.
const STORAGE_PREFIX = 'league-chat-messages';
const storageKey = (leagueId: string | null) => `${STORAGE_PREFIX}:${leagueId ?? 'none'}`;

const SUGGESTIONS = [
  'Who has the most valuable roster right now?',
  'What were the biggest trades this season?',
  "Which team owns the most 2027 draft picks?",
  'Who are the top 5 risers in value this month?',
  'Which manager has the best all-time record?',
  'What was the highest-scoring week ever?',
];

// ─── Helpers ────────────────────────────────────────────────────────

function loadMessages(leagueId: string | null): ChatMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(leagueId));
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

async function askLeagueBot(
  turns: { role: string; content: string }[],
  league: ChatLeagueContext | null
) {
  const { data, error } = await supabase.functions.invoke('chat', {
    body: { messages: turns, league: league ?? undefined },
  });

  if (error) {
    // FunctionsHttpError carries the response; surface the server's message
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      try {
        const body = await ctx.json();
        throw new Error(body.error || error.message);
      } catch (e) {
        if (e instanceof Error && e.message !== error.message) throw e;
      }
    }
    throw new Error(error.message);
  }
  if (!data?.success) throw new Error(data?.error || 'The assistant failed to respond.');
  return data as { reply: string; steps: QueryStep[]; widgets?: ChatWidget[] };
}

// ─── Sub-components ─────────────────────────────────────────────────

function QuerySteps({ steps }: { steps: QueryStep[] }) {
  if (!steps.length) return null;
  return (
    <details className="group mt-2">
      <summary className="flex items-center gap-1.5 cursor-pointer text-[11px] text-[#75757f] hover:text-[#9c9ca7] select-none list-none">
        <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
        <Database className="h-3 w-3" />
        {steps.length} {steps.length === 1 ? 'query' : 'queries'} run
      </summary>
      <div className="mt-2 space-y-1.5">
        {steps.map((s, i) => (
          <div key={i} className="rounded-lg bg-[#101014] border border-[#1b1b22] px-3 py-2">
            <pre className="text-[11px] text-[#9c9ca7] whitespace-pre-wrap break-words font-mono">
              {s.sql}
            </pre>
            <p className={`text-[10px] mt-1 ${s.error ? 'text-red-400' : 'text-[#60606a]'}`}>
              {s.error ? `Error: ${s.error}` : `${s.rows} row${s.rows === 1 ? '' : 's'}`}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="chat-markdown text-[13.5px] leading-relaxed text-[#d6d6de]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: (props) => (
            <div className="overflow-x-auto my-2 rounded-lg border border-[#2a2a34]">
              <table className="w-full text-[12.5px]" {...props} />
            </div>
          ),
          thead: (props) => <thead className="bg-[#17171d]" {...props} />,
          th: (props) => (
            <th
              className="px-3 py-1.5 text-left font-semibold text-[#9c9ca7] border-b border-[#2a2a34] whitespace-nowrap"
              {...props}
            />
          ),
          td: (props) => (
            <td className="px-3 py-1.5 border-b border-[#1b1b22] whitespace-nowrap" {...props} />
          ),
          code: (props) => (
            <code className="bg-[#17171d] px-1 py-0.5 rounded text-[12px] text-accent-600" {...props} />
          ),
          a: ({ href, children, ...props }) => {
            // Internal app links (e.g. /players/:id, /teams/:id) route in-app;
            // anything else opens in a new tab.
            if (href?.startsWith('/')) {
              return (
                <Link to={href} className="text-accent-500 hover:underline">
                  {children}
                </Link>
              );
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-accent-500 hover:underline"
                {...props}
              >
                {children}
              </a>
            );
          },
          ul: (props) => <ul className="list-disc pl-5 my-1.5 space-y-0.5" {...props} />,
          ol: (props) => <ol className="list-decimal pl-5 my-1.5 space-y-0.5" {...props} />,
          p: (props) => <p className="my-1.5" {...props} />,
          h1: (props) => <h3 className="font-semibold text-white mt-3 mb-1" {...props} />,
          h2: (props) => <h3 className="font-semibold text-white mt-3 mb-1" {...props} />,
          h3: (props) => <h4 className="font-semibold text-white mt-2 mb-1" {...props} />,
          strong: (props) => <strong className="text-white font-semibold" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────

export default function Chat() {
  const { data: league } = useChatLeagueContext();
  const leagueId = league?.seasons[0]?.league_id ?? null;
  const leagueName = league?.name ?? 'your league';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load the stored thread for the active league (and reload when it changes).
  useEffect(() => {
    setMessages(loadMessages(leagueId));
  }, [leagueId]);

  useEffect(() => {
    localStorage.setItem(storageKey(leagueId), JSON.stringify(messages));
  }, [messages, leagueId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || pending) return;

    const history = [...messages, { role: 'user' as const, content: question }];
    setMessages(history);
    setInput('');
    setPending(true);

    try {
      const turns = history
        .filter((m) => !m.error)
        .map(({ role, content }) => ({ role, content }));
      const { reply, steps, widgets } = await askLeagueBot(turns, league ?? null);
      setMessages([...history, { role: 'assistant', content: reply, steps, widgets }]);
    } catch (e) {
      setMessages([
        ...history,
        {
          role: 'assistant',
          content: e instanceof Error ? e.message : 'Something went wrong.',
          error: true,
        },
      ]);
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  };

  const clear = () => {
    setMessages([]);
    localStorage.removeItem(storageKey(leagueId));
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-104px)] lg:h-dvh max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 pt-4 lg:pt-6 pb-3 shrink-0">
        <div>
          <p className="text-[11px] font-bold text-accent-500 tracking-[0.2em] uppercase mb-0.5">
            Ask the league
          </p>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            League Chat
          </h1>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clear}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] text-[#75757f] hover:text-[#d6d6de] hover:bg-[#1b1b22] transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-accent-500/10 flex items-center justify-center mb-4">
              <Sparkles className="h-6 w-6 text-accent-500" />
            </div>
            <h2 className="text-white font-semibold mb-1">Ask anything about {leagueName}</h2>
            <p className="text-[13px] text-[#75757f] mb-6 max-w-sm">
              Rosters, trades, draft picks, player values, matchups — the assistant queries the
              league database live to answer.
            </p>
            <div className="grid sm:grid-cols-2 gap-2 w-full max-w-xl">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-[12.5px] text-[#9c9ca7] px-3.5 py-2.5 rounded-xl bg-[#141419] border border-[#1b1b22] hover:border-accent-500/40 hover:text-[#d6d6de] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent-500/15 border border-accent-500/20 px-4 py-2.5 text-[13.5px] text-white whitespace-pre-wrap">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex gap-3">
                  <div
                    className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 ${
                      m.error ? 'bg-red-500/10' : 'bg-accent-500/10'
                    }`}
                  >
                    {m.error ? (
                      <AlertCircle className="h-4 w-4 text-red-400" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-accent-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    {m.error ? (
                      <p className="text-[13px] text-red-400 pt-1">{m.content}</p>
                    ) : (
                      m.content && <AssistantMarkdown content={m.content} />
                    )}
                    {!m.error && <ChatWidgets widgets={m.widgets} />}
                    {m.steps && <QuerySteps steps={m.steps} />}
                  </div>
                </div>
              )
            )}
            {pending && (
              <div className="flex gap-3">
                <div className="shrink-0 w-7 h-7 rounded-lg bg-accent-500/10 flex items-center justify-center mt-0.5">
                  <Sparkles className="h-4 w-4 text-accent-500" />
                </div>
                <div className="flex items-center gap-2 text-[13px] text-[#75757f] pt-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Querying the league database…
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 sm:px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:pb-6 pt-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2 rounded-2xl bg-[#141419] border border-[#2a2a34] focus-within:border-accent-500/50 px-3 py-2 transition-colors"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Ask about rosters, trades, values…"
            className="flex-1 bg-transparent resize-none outline-none text-[13.5px] text-white placeholder:text-[#60606a] py-1.5 max-h-32"
          />
          <button
            type="submit"
            disabled={!input.trim() || pending}
            className="shrink-0 w-9 h-9 rounded-xl bg-accent-500 hover:bg-accent-400 active:bg-accent-300 disabled:bg-[#1b1b22] disabled:text-[#60606a] text-black flex items-center justify-center transition-colors"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizonal className="h-4 w-4" />
            )}
          </button>
        </form>
        <p className="text-[10px] text-[#60606a] text-center mt-2">
          Answers come from live league data — double-check before making trades.
        </p>
      </div>
    </div>
  );
}
