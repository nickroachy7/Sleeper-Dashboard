import { useSyncExternalStore } from 'react';

// ── Show-IDP preference ───────────────────────────────────────────
// Most dynasty leagues run offense-only, so individual defensive players (IDP)
// are hidden everywhere by default: the Ranking board, the "who'd you rather"
// vote pools, the feed movers, and public ranking boards. Users who run IDP
// leagues flip this on and IDP players appear — and become votable — for them.
//
// Per-user and votes-gated on purpose: because the vote pools respect this
// flag, only IDP-interested users ever cast IDP votes, so IDP community values
// are shaped by people who actually run those leagues while the default-off
// majority never touches them.
//
// localStorage-backed and guest-first (no account, no migration), matching the
// app's other client preferences. Tradeoff: the choice doesn't follow an
// account across devices — acceptable for a view preference.

const KEY = 'sleeper_dash.showIdp';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function write(value: boolean): void {
  try {
    if (value) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

const listeners = new Set<() => void>();
let cache = read();
const emit = () => listeners.forEach((l) => l());
const refresh = () => { cache = read(); emit(); };

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === KEY) refresh(); });
}

export const idpStore = {
  get: (): boolean => cache,
  set(value: boolean): void {
    write(value);
    refresh();
  },
  toggle(): void {
    idpStore.set(!cache);
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};

/** Reactive read of the "show IDP players" preference (default false). */
export function useShowIdp(): boolean {
  return useSyncExternalStore(idpStore.subscribe, idpStore.get, idpStore.get);
}
