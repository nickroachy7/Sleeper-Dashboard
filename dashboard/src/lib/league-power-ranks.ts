import { useSyncExternalStore } from 'react';

// ── League power ranks (your take on your league) ────────────────────────────
// "Rank the League": a manager's own ordering of the teams in their league —
// who they think is strongest, top to bottom. The consensus power ranking
// (value-based, from useTeamStrength) is the field; this is YOUR take, and the
// diff between them is the argument starter for the group chat.
//
// localStorage per league (keyed by rootLeagueId → ordered roster_id[]). Guest-
// friendly, no schema. Sparse: only leagues the user has actually ranked get a
// key; an unranked league falls back to the consensus order in the UI.

const KEY = 'yap.leaguePowerRanks';

type Store = Record<string, number[]>; // rootLeagueId -> ordered roster ids

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Store = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v) && v.every((n) => typeof n === 'number')) out[k] = v as number[];
    }
    return out;
  } catch {
    return {};
  }
}

function write(store: Store) {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* quota */ }
}

const listeners = new Set<() => void>();
let cache = read();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === KEY) { cache = read(); emit(); } });
}

export const leaguePowerRanks = {
  /** The user's saved order for a league, or null if they haven't ranked it. */
  get(leagueId: string | null | undefined): number[] | null {
    if (!leagueId) return null;
    return cache[leagueId] ?? null;
  },

  /** Save (overwrite) the order for a league. */
  set(leagueId: string, order: number[]): void {
    cache = { ...cache, [leagueId]: order };
    write(cache);
    emit();
  },

  /** Clear a league's custom order (revert to consensus). */
  clear(leagueId: string): void {
    if (!(leagueId in cache)) return;
    const next = { ...cache };
    delete next[leagueId];
    cache = next;
    write(cache);
    emit();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** Reactive saved order for one league (null if unranked). */
export function useLeaguePowerRanks(leagueId: string | null | undefined): number[] | null {
  useSyncExternalStore(leaguePowerRanks.subscribe, () => cache, () => cache);
  if (!leagueId) return null;
  return cache[leagueId] ?? null;
}
