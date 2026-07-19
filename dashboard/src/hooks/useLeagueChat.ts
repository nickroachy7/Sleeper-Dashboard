import { useEffect, useRef, useState } from 'react';
import { useChatLeagueContext } from './queries';
import { useActiveLeague } from '../lib/active-league';
import { askLeagueBot, type ChatMessage } from '../lib/league-chat';
import {
  listSessions, saveSession, deleteSession, newSessionId, titleFromMessages,
  type ChatSession,
} from '../lib/chat-sessions';

// ── Conversation engine ──────────────────────────────────────────────
// The league assistant's state + persistence, lifted out of the old Chat
// page so the search overlay can host the same conversation without
// duplicating the wiring. Sessions persist per active league in
// localStorage; asking a question streams a reply from askLeagueBot and
// saves the thread. Pure logic — no layout — so any surface can render it.
export function useLeagueChat() {
  const { activeLeagueId } = useActiveLeague();
  const { data: leagueContext } = useChatLeagueContext();
  const chatLeagueId = leagueContext?.seasons[0]?.league_id ?? activeLeagueId ?? null;

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const activeIdRef = useRef<string | null>(null);

  const setActiveSession = (id: string | null) => { activeIdRef.current = id; };
  const refreshSessions = () => setSessions(listSessions(chatLeagueId));

  // Load this league's saved conversations (and reload on league switch).
  useEffect(() => {
    setSessions(listSessions(chatLeagueId));
    setActiveSession(null);
    setMessages([]);
  }, [chatLeagueId]);

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
    }
  };

  const startNewChat = (seed?: string) => {
    setActiveSession(newSessionId());
    setMessages([]);
    if (seed?.trim()) void send(seed, []);
  };

  const openSession = (s: ChatSession) => {
    setActiveSession(s.id);
    setMessages(s.messages);
  };

  const removeSession = (id: string) => {
    deleteSession(chatLeagueId, id);
    setSessions(listSessions(chatLeagueId));
    if (activeIdRef.current === id) { setActiveSession(null); setMessages([]); }
  };

  const reset = () => { setActiveSession(null); setMessages([]); };

  const hasThread = messages.length > 0 || activeIdRef.current !== null;

  return {
    leagueContext, sessions, messages, pending, hasThread,
    send, startNewChat, openSession, removeSession, reset,
  };
}
