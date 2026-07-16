import { supabase } from './supabase';
import type { ChatLeagueContext } from '../hooks/queries';
import type { ChatWidget } from '../components/chat/ChatWidgets';

// ── Shared League Chat logic ──────────────────────────────────────
// The assistant is reached from the global search palette (LookupSearch).
// This module holds the transport + persistence so the UI just renders.

export interface QueryStep {
  sql: string;
  rows: number | null;
  error: string | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  steps?: QueryStep[];
  widgets?: ChatWidget[];
  error?: boolean;
}

// Persist per active league so switching leagues shows that league's thread.
const STORAGE_PREFIX = 'league-chat-messages';
export const chatStorageKey = (leagueId: string | null) =>
  `${STORAGE_PREFIX}:${leagueId ?? 'none'}`;

export function loadMessages(leagueId: string | null): ChatMessage[] {
  try {
    const raw = localStorage.getItem(chatStorageKey(leagueId));
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

export async function askLeagueBot(
  turns: { role: string; content: string }[],
  league: ChatLeagueContext | null
): Promise<{ reply: string; steps: QueryStep[]; widgets?: ChatWidget[] }> {
  const { data, error } = await supabase.functions.invoke('chat', {
    body: { messages: turns, league: league ?? undefined },
  });

  if (error) {
    // FunctionsHttpError carries the response; surface the server's message.
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
