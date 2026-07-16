import type { ChatMessage } from './league-chat';

// ── Chat sessions ─────────────────────────────────────────────────
// Multiple persisted conversations per league. The command bar's chat button
// starts new ones and resumes previous ones. Stored in localStorage so a
// session survives leaving the overlay (and a reload).

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

const KEY = (leagueId: string | null) => `chat-sessions:${leagueId ?? 'none'}`;
const MAX_SESSIONS = 30;

export function newSessionId(): string {
  return `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** A short title from the first user message. */
export function titleFromMessages(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user')?.content?.trim();
  if (!first) return 'New chat';
  return first.length > 48 ? first.slice(0, 47).trimEnd() + '…' : first;
}

export function listSessions(leagueId: string | null): ChatSession[] {
  try {
    const raw = localStorage.getItem(KEY(leagueId));
    const arr = raw ? (JSON.parse(raw) as ChatSession[]) : [];
    return arr.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function getSession(leagueId: string | null, id: string): ChatSession | null {
  return listSessions(leagueId).find((s) => s.id === id) ?? null;
}

/** Insert or update a session (upsert by id), newest first, capped. */
export function saveSession(leagueId: string | null, session: ChatSession): void {
  try {
    const all = listSessions(leagueId).filter((s) => s.id !== session.id);
    all.unshift(session);
    const trimmed = all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SESSIONS);
    localStorage.setItem(KEY(leagueId), JSON.stringify(trimmed));
  } catch {
    /* ignore quota errors */
  }
}

export function deleteSession(leagueId: string | null, id: string): void {
  try {
    const all = listSessions(leagueId).filter((s) => s.id !== id);
    localStorage.setItem(KEY(leagueId), JSON.stringify(all));
  } catch {
    /* ignore */
  }
}
