import { useSyncExternalStore } from 'react';

// ── Watchlist ────────────────────────────────────────────────────────────────
// Assets (players or picks) a visitor is tracking so they can watch the market
// move on trade targets. localStorage-backed like the league + my-team stores —
// works for guests immediately, no schema. (An account-synced table can be
// layered on later behind this same interface, the way leagues were.)
//
// Stored as a set of asset ids: a Sleeper player_id, or a 'PICK:YYYY-R' sentinel
// (the same id space vote-assets uses), so a watchlist can hold both.

const KEY = 'yap.watchlist';

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* quota */ }
}

const listeners = new Set<() => void>();
let cache = read();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === KEY) { cache = read(); emit(); } });
}

export const watchlist = {
  /** Stable snapshot of watched asset ids (newest first). */
  all: (): string[] => cache,

  has(id: string): boolean {
    return cache.includes(id);
  },

  /** Add an asset to the watchlist (no-op if already present). */
  add(id: string): void {
    if (cache.includes(id)) return;
    cache = [id, ...cache];
    write(cache);
    emit();
  },

  remove(id: string): void {
    if (!cache.includes(id)) return;
    cache = cache.filter((x) => x !== id);
    write(cache);
    emit();
  },

  toggle(id: string): void {
    if (cache.includes(id)) this.remove(id);
    else this.add(id);
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** Reactive full watchlist (asset id array). */
export function useWatchlist(): string[] {
  return useSyncExternalStore(watchlist.subscribe, () => cache, () => cache);
}

/** Reactive "is this asset watched?" for a single id. */
export function useIsWatched(id: string | null | undefined): boolean {
  const list = useWatchlist();
  return !!id && list.includes(id);
}
